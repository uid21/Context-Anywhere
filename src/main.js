import {
  Plugin,
  PluginSettingTab,
  Setting,
  Notice,
  TFile,
  Modal,
  requestUrl,
  activeDocument,
  activeWindow,
  getLanguage,
} from "obsidian";
import { createTranslator, detectLocale } from "./i18n.js";
import { isConfigPath, isConflictPath, normalizePrefix, shouldMirrorPath } from "./rules.js";
import { decideSyncAction, makeConflictPath, remoteSnapshot, stateFrom } from "./sync.js";

const SERVER_MAX_ATTACHMENT_MIB = 8;
const TRANSFER_VERSION = "1";
const TRANSFER_PROTOCOL = "ai-bridge";
const AUTO_CHECK_MS = 30 * 1000;
const ATTACHMENT_MIME = {
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
};

function runtimeWindow() {
  return activeWindow || window;
}

function runtimeDocument() {
  return activeDocument || runtimeWindow().document;
}

const DEFAULT_SETTINGS = {
  workerUrl: "",
  token: "",
  includePrefixes: [],
  debounceMs: 1200,
  syncOnChange: true,
  autoSyncEnabled: false,
  autoSyncIntervalMinutes: 15,
  syncAttachments: false,
  maxAttachmentMiB: 8,
  lastPeriodicSyncAt: 0,
  bidirectionalEnabled: false,
  deviceId: "",
  deviceName: "",
  syncState: { notes: {}, assets: {} },
  pendingDeletes: { notes: {}, assets: {} },
  lastBidirectionalSyncAt: 0,
  lastConflictCount: 0,
  lastConflictPath: "",
  lastSyncError: "",
};

function recordObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function clampNumber(value, minimum, maximum, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

function normalizeSettings(raw = {}) {
  const merged = Object.assign({}, DEFAULT_SETTINGS, raw || {});
  const prefixes = Array.isArray(merged.includePrefixes)
    ? merged.includePrefixes.map(normalizePrefix).filter(Boolean)
    : DEFAULT_SETTINGS.includePrefixes.slice();
  return {
    workerUrl: String(merged.workerUrl || "").trim(),
    token: String(merged.token || "").trim(),
    includePrefixes: prefixes,
    debounceMs: Math.round(clampNumber(merged.debounceMs, 250, 10000, 1200)),
    syncOnChange: merged.syncOnChange !== false,
    autoSyncEnabled: merged.autoSyncEnabled === true,
    autoSyncIntervalMinutes: Math.round(clampNumber(merged.autoSyncIntervalMinutes, 1, 1440, 15)),
    syncAttachments: merged.syncAttachments === true,
    maxAttachmentMiB: clampNumber(merged.maxAttachmentMiB, 1, SERVER_MAX_ATTACHMENT_MIB, 8),
    lastPeriodicSyncAt: Math.max(0, Number(merged.lastPeriodicSyncAt) || 0),
    bidirectionalEnabled: merged.bidirectionalEnabled === true,
    deviceId: String(merged.deviceId || "").trim(),
    deviceName: String(merged.deviceName || "").trim(),
    syncState: {
      notes: recordObject(recordObject(merged.syncState).notes),
      assets: recordObject(recordObject(merged.syncState).assets),
    },
    pendingDeletes: {
      notes: recordObject(recordObject(merged.pendingDeletes).notes),
      assets: recordObject(recordObject(merged.pendingDeletes).assets),
    },
    lastBidirectionalSyncAt: Math.max(0, Number(merged.lastBidirectionalSyncAt) || 0),
    lastConflictCount: Math.max(0, Number(merged.lastConflictCount) || 0),
    lastConflictPath: String(merged.lastConflictPath || ""),
    lastSyncError: String(merged.lastSyncError || ""),
  };
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return runtimeWindow().btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = runtimeWindow().atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function deriveTransferKey(passphrase, salt) {
  const encoder = new TextEncoder();
  const material = await runtimeWindow().crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return runtimeWindow().crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptTransferPayload(payload, passphrase) {
  const salt = runtimeWindow().crypto.getRandomValues(new Uint8Array(16));
  const iv = runtimeWindow().crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveTransferKey(passphrase, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = new Uint8Array(await runtimeWindow().crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext));
  return {
    salt: bytesToBase64Url(salt),
    iv: bytesToBase64Url(iv),
    data: bytesToBase64Url(ciphertext),
  };
}

async function decryptTransferPayload(params, passphrase) {
  const salt = base64UrlToBytes(params.salt);
  const iv = base64UrlToBytes(params.iv);
  const ciphertext = base64UrlToBytes(params.data);
  if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 17) {
    throw new Error("Invalid settings link format");
  }
  const key = await deriveTransferKey(passphrase, salt);
  const plaintext = await runtimeWindow().crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext));
}

async function copyText(text) {
  if (runtimeWindow().navigator.clipboard?.writeText) {
    await runtimeWindow().navigator.clipboard.writeText(text);
    return;
  }
  const document = runtimeDocument();
  const area = document.createElement("textarea");
  area.value = text;
  area.addClass("ai-bridge-clipboard-helper");
  document.body.appendChild(area);
  area.select();
  const copied = document.execCommand("copy");
  area.remove();
  if (!copied) throw new Error("Unable to copy to the clipboard");
}

async function sha256Hex(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
  const digest = new Uint8Array(await runtimeWindow().crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function responseJson(response) {
  return response?.json && typeof response.json === "object" ? response.json : {};
}

class AIBridgePlugin extends Plugin {
  async onload() {
    this.settings = normalizeSettings(await this.loadData());
    if (!this.settings.deviceId) this.settings.deviceId = runtimeWindow().crypto.randomUUID();
    if (!this.settings.deviceName) this.settings.deviceName = `Device-${this.settings.deviceId.slice(0, 6)}`;
    this.locale = detectLocale(getLanguage);
    this.t = createTranslator(this.locale);
    this.timers = new Map();
    this.inFlightNotes = new Map();
    this.fullSyncPromise = null;
    this.bidirectionalPromise = null;
    this.bidirectionalTimer = null;
    this.applyingRemote = false;
    this.lastAutoAttemptAt = 0;
    await this.persistSettings();

    this.addCommand({
      id: "sync-ai-mirror-now",
      name: this.t("command.fullSync"),
      callback: () => this.runPreferredSync(true),
    });
    this.addRibbonIcon("cloud-upload", this.t("command.fullSync"), () => {
      this.runPreferredSync(true).catch((error) => {
        console.warn("AI Bridge manual sync failed", String(error?.message || error));
      });
    });
    this.addSettingTab(new AIBridgeSettingTab(this.app, this));

    this.registerEvent(this.app.vault.on("create", (file) => this.handleVaultChange(file)));
    this.registerEvent(this.app.vault.on("modify", (file) => this.handleVaultChange(file)));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      if (this.applyingRemote) return;
      if (this.settings.bidirectionalEnabled) {
        this.recordPendingDelete(oldPath, file);
        this.handleVaultChange(file);
        return;
      }
      if (!this.settings.syncOnChange) return;
      if (this.shouldMirrorPath(oldPath)) this.deleteRemote(oldPath).catch(() => {});
      if (this.settings.syncAttachments && this.isSupportedAttachmentPath(oldPath)) {
        this.deleteRemoteAttachment(oldPath).catch(() => {});
      }
      this.handleVaultChange(file);
    }));
    this.registerEvent(this.app.vault.on("delete", (file) => {
      if (this.applyingRemote) return;
      if (this.settings.bidirectionalEnabled) {
        this.recordPendingDelete(file.path, file);
        this.queueBidirectionalSync();
        return;
      }
      if (!this.settings.syncOnChange) return;
      if (file instanceof TFile && this.shouldMirror(file)) {
        this.deleteRemote(file.path).catch(() => {});
      }
      if (file instanceof TFile && this.settings.syncAttachments && this.isSupportedAttachment(file)) {
        this.deleteRemoteAttachment(file.path).catch(() => {});
      }
    }));

    this.registerObsidianProtocolHandler(TRANSFER_PROTOCOL, (params) => {
      this.handleTransferImport(params).catch((error) => {
        console.warn("AI Bridge settings import failed", String(error?.message || error));
        new Notice(this.t("generic.errorPrefix", { message: String(error?.message || error) }));
      });
    });
    this.registerInterval(window.setInterval(() => {
      this.maybeRunAutoSync().catch((error) => {
        console.warn("AI Bridge scheduled sync failed", String(error?.message || error));
      });
    }, AUTO_CHECK_MS));

    this.app.workspace.onLayoutReady(() => {
      if (!this.settings.bidirectionalEnabled || !this.ready()) return;
      window.setTimeout(() => this.syncBidirectional(false).catch((error) => {
        console.warn("AI Bridge startup two-way sync failed", String(error?.message || error));
      }), 1500);
    });
  }

  onunload() {
    for (const timer of this.timers.values()) window.clearTimeout(timer);
    this.timers.clear();
    if (this.bidirectionalTimer) window.clearTimeout(this.bidirectionalTimer);
  }

  async persistSettings() {
    this.settings = normalizeSettings(this.settings);
    await this.saveData(this.settings);
  }

  normalizeBase() {
    return (this.settings.workerUrl || "").trim().replace(/\/+$/, "");
  }

  ready() {
    return Boolean(this.normalizeBase() && (this.settings.token || "").trim());
  }

  shouldMirrorPath(path) {
    return shouldMirrorPath(path, this.settings.includePrefixes, this.app.vault.configDir);
  }

  shouldMirror(file) {
    return file instanceof TFile && file.extension.toLowerCase() === "md" && this.shouldMirrorPath(file.path);
  }

  isSupportedAttachment(file) {
    return file instanceof TFile
      && this.isSupportedAttachmentPath(file.path);
  }

  isSupportedAttachmentPath(path) {
    const normalized = String(path || "").replace(/\\/g, "/");
    const extension = normalized.includes(".") ? normalized.split(".").pop().toLowerCase() : "";
    return Boolean(ATTACHMENT_MIME[extension])
      && !isConfigPath(normalized, this.app.vault.configDir)
      && !isConflictPath(normalized);
  }

  handleVaultChange(file) {
    if (this.applyingRemote) return;
    if (!this.ready() || !(file instanceof TFile)) return;
    if (this.settings.bidirectionalEnabled) {
      if (this.shouldMirror(file) || (this.settings.syncAttachments && this.isSupportedAttachment(file))) {
        this.queueBidirectionalSync();
      }
      return;
    }
    if (!this.settings.syncOnChange) return;
    if (this.shouldMirror(file)) {
      this.queueNote(file);
      return;
    }
    if (this.settings.syncAttachments && this.isSupportedAttachment(file)) {
      this.queueNotesReferencingAttachment(file);
    }
  }

  recordPendingDelete(path, file) {
    const normalized = String(path || "").replace(/\\/g, "/");
    if (this.shouldMirrorPath(normalized)) {
      this.settings.pendingDeletes.notes[normalized] = Date.now();
    } else if (file instanceof TFile && this.settings.syncAttachments && this.isSupportedAttachmentPath(normalized)) {
      this.settings.pendingDeletes.assets[normalized] = Date.now();
    }
    this.persistSettings().catch(() => {});
  }

  queueBidirectionalSync() {
    if (!this.settings.bidirectionalEnabled || !this.ready()) return;
    if (this.bidirectionalTimer) window.clearTimeout(this.bidirectionalTimer);
    this.bidirectionalTimer = window.setTimeout(() => {
      this.bidirectionalTimer = null;
      this.syncBidirectional(false).catch((error) => {
        console.warn("AI Bridge two-way sync failed", String(error?.message || error));
      });
    }, this.settings.debounceMs);
  }

  runPreferredSync(showNotice = false) {
    return this.settings.bidirectionalEnabled
      ? this.syncBidirectional(showNotice)
      : this.syncAll(showNotice, { changedOnly: false });
  }

  queueNote(file) {
    if (!this.shouldMirror(file) || !this.ready()) return;
    const path = file.path;
    const old = this.timers.get(path);
    if (old) window.clearTimeout(old);
    this.timers.set(path, window.setTimeout(() => {
      this.timers.delete(path);
      this.pushFile(file).catch((error) => {
        console.warn("AI Bridge sync failed for", path, String(error?.message || error));
      });
    }, this.settings.debounceMs));
  }

  queueNotesReferencingAttachment(attachment) {
    const key = `attachment:${attachment.path}`;
    const old = this.timers.get(key);
    if (old) window.clearTimeout(old);
    this.timers.set(key, window.setTimeout(() => {
      this.timers.delete(key);
      for (const note of this.app.vault.getMarkdownFiles()) {
        if (!this.shouldMirror(note)) continue;
        if (this.getReferencedAttachments(note).some((file) => file.path === attachment.path)) {
          this.queueNote(note);
        }
      }
    }, this.settings.debounceMs));
  }

  async api(path, options = {}) {
    if (!this.ready()) throw new Error(this.t("error.unconfigured"));
    const headers = Object.assign({}, options.headers || {}, {
      Authorization: `Bearer ${this.settings.token}`,
    });
    if (typeof options.body === "string" && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    return requestUrl({
      url: `${this.normalizeBase()}${path}`,
      method: options.method || "GET",
      headers,
      body: options.body,
      throw: false,
    });
  }

  frontmatterAllowsPdf(note) {
    const value = this.app.metadataCache.getFileCache(note)?.frontmatter?.["ai-attachments"];
    return value === true || value === 1 || ["true", "yes", "on", "1"].includes(String(value || "").toLowerCase());
  }

  getReferencedAttachments(note) {
    const cache = this.app.metadataCache.getFileCache(note) || {};
    const references = [...(cache.embeds || []), ...(cache.links || [])];
    const allowPdf = this.frontmatterAllowsPdf(note);
    const found = new Map();
    for (const reference of references) {
      const target = this.app.metadataCache.getFirstLinkpathDest(reference.link, note.path);
      if (!this.isSupportedAttachment(target)) continue;
      if (target.extension.toLowerCase() === "pdf" && !allowPdf) continue;
      found.set(target.path, target);
    }
    return Array.from(found.values());
  }

  async uploadAttachment(note, attachment, baseVersion = 0) {
    const maxBytes = this.settings.maxAttachmentMiB * 1024 * 1024;
    if ((attachment.stat?.size || 0) > maxBytes) return { uploaded: 0, skipped: 1 };
    const mime = ATTACHMENT_MIME[attachment.extension.toLowerCase()];
    const binary = await this.app.vault.readBinary(attachment);
    const query = `?path=${encodeURIComponent(attachment.path)}&note=${encodeURIComponent(note.path)}`;
    const response = await this.api(`/asset${query}`, {
      method: "PUT",
      headers: {
        "Content-Type": mime,
        "X-Mirror-Mtime": String(attachment.stat?.mtime || Date.now()),
        "X-Mirror-Device": this.settings.deviceId,
        "X-Mirror-Base-Version": String(baseVersion || 0),
      },
      body: binary,
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(this.t("error.attachmentUploadFailed", {
        path: attachment.path,
        status: response.status,
      }));
    }
    return { uploaded: 1, skipped: 0, remote: responseJson(response) };
  }

  async pushFile(file, baseVersion = 0, includeAttachments = true) {
    if (!this.shouldMirror(file)) return { uploaded: 0, skipped: 0 };
    const existing = this.inFlightNotes.get(file.path);
    if (existing) return existing;
    const job = this.pushFileNow(file, baseVersion, includeAttachments).finally(() => this.inFlightNotes.delete(file.path));
    this.inFlightNotes.set(file.path, job);
    return job;
  }

  async pushFileNow(file, baseVersion = 0, includeAttachments = true) {
    const content = await this.app.vault.read(file);
    const response = await this.api("/note", {
      method: "PUT",
      body: JSON.stringify({
        path: file.path,
        content,
        mtime: file.stat?.mtime || Date.now(),
        deviceId: this.settings.deviceId,
        baseVersion,
      }),
    });
    if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}`);

    const totals = { uploaded: 0, skipped: 0 };
    if (!this.settings.syncAttachments || !includeAttachments) return { ...totals, remote: responseJson(response) };
    for (const attachment of this.getReferencedAttachments(file)) {
      const result = await this.uploadAttachment(file, attachment);
      totals.uploaded += result.uploaded;
      totals.skipped += result.skipped;
    }
    return { ...totals, remote: responseJson(response) };
  }

  async deleteRemote(path, options = {}) {
    if (!this.ready() || !this.shouldMirrorPath(path)) return;
    const params = new URLSearchParams({
      path,
      mtime: String(options.mtime || Date.now()),
      deviceId: this.settings.deviceId,
      baseVersion: String(options.baseVersion || 0),
    });
    const response = await this.api(`/note?${params.toString()}`, { method: "DELETE" });
    if (response.status !== 404 && (response.status < 200 || response.status >= 300)) {
      throw new Error(`HTTP ${response.status}`);
    }
    return responseJson(response);
  }

  async deleteRemoteAttachment(path, options = {}) {
    if (!this.ready() || !this.isSupportedAttachmentPath(path)) return;
    const params = new URLSearchParams({
      path,
      mtime: String(options.mtime || Date.now()),
      deviceId: this.settings.deviceId,
      baseVersion: String(options.baseVersion || 0),
    });
    const response = await this.api(`/asset?${params.toString()}`, { method: "DELETE" });
    if (response.status !== 404 && (response.status < 200 || response.status >= 300)) {
      throw new Error(`HTTP ${response.status}`);
    }
    return responseJson(response);
  }

  async ensureParentFolders(path) {
    const parts = String(path || "").replace(/\\/g, "/").split("/").slice(0, -1);
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(current)) {
        try {
          await this.app.vault.createFolder(current);
        } catch {
          if (!this.app.vault.getAbstractFileByPath(current)) throw new Error(`Unable to create folder: ${current}`);
        }
      }
    }
  }

  uniqueConflictPath(path) {
    if (!this.app.vault.getAbstractFileByPath(path)) return path;
    const dot = path.lastIndexOf(".");
    const stem = dot > path.lastIndexOf("/") ? path.slice(0, dot) : path;
    const extension = dot > path.lastIndexOf("/") ? path.slice(dot) : "";
    for (let index = 2; index < 1000; index += 1) {
      const candidate = `${stem} ${index}${extension}`;
      if (!this.app.vault.getAbstractFileByPath(candidate)) return candidate;
    }
    throw new Error("Unable to allocate a conflict copy path");
  }

  async saveConflictCopy(path, value, sourceDevice, mtime, binary = false) {
    const conflictPath = this.uniqueConflictPath(makeConflictPath(path, sourceDevice, mtime));
    await this.ensureParentFolders(conflictPath);
    if (binary) await this.app.vault.createBinary(conflictPath, value);
    else await this.app.vault.create(conflictPath, value);
    this.settings.lastConflictPath = conflictPath;
    return conflictPath;
  }

  async localNoteSnapshot(file) {
    const content = await this.app.vault.read(file);
    return { file, content, hash: await sha256Hex(content), mtime: Number(file.stat?.mtime || 0) };
  }

  async readRemoteNote(path) {
    const response = await this.api(`/note?path=${encodeURIComponent(path)}`);
    if (response.status < 200 || response.status >= 300) throw new Error(`Unable to download ${path}: HTTP ${response.status}`);
    return responseJson(response);
  }

  async writeRemoteNote(path, content) {
    await this.ensureParentFolders(path);
    const existing = this.app.vault.getAbstractFileByPath(path);
    this.applyingRemote = true;
    try {
      if (existing instanceof TFile) await this.app.vault.modify(existing, content);
      else await this.app.vault.create(path, content);
    } finally {
      this.applyingRemote = false;
    }
    const written = this.app.vault.getAbstractFileByPath(path);
    if (!(written instanceof TFile)) throw new Error(`Unable to write ${path}`);
    return this.localNoteSnapshot(written);
  }

  async deleteLocalFile(file) {
    if (!(file instanceof TFile)) return;
    this.applyingRemote = true;
    try {
      await this.app.vault.delete(file);
    } finally {
      this.applyingRemote = false;
    }
  }

  async fetchSyncManifest() {
    const response = await this.api("/sync/manifest");
    if (response.status < 200 || response.status >= 300) throw new Error(`Manifest HTTP ${response.status}`);
    const manifest = responseJson(response);
    if (manifest.schema !== 1 || !Array.isArray(manifest.notes)) throw new Error("Unsupported sync manifest");
    return manifest;
  }

  async syncNotes(manifest, totals) {
    const local = new Map();
    for (const file of this.app.vault.getMarkdownFiles().filter((item) => this.shouldMirror(item))) {
      local.set(file.path, await this.localNoteSnapshot(file));
    }
    const remote = new Map(manifest.notes.map((item) => [item.path, item]));
    const tombstones = new Map(manifest.deletedNotes.map((item) => [item.path, item]));
    const states = this.settings.syncState.notes;
    const allPaths = new Set([...local.keys(), ...remote.keys(), ...tombstones.keys(), ...Object.keys(states)]);

    for (const path of [...allPaths].sort()) {
      if (!this.shouldMirrorPath(path)) continue;
      this.currentSyncItem = `note:${path}`;
      const localItem = local.get(path) || null;
      const remoteItem = remote.get(path) || null;
      const tombstone = tombstones.get(path) || null;
      const base = states[path] || null;
      if (!localItem && base?.localHash && this.settings.pendingDeletes.notes[path]) {
        base.localDeletedAt = this.settings.pendingDeletes.notes[path];
      }
      const decision = decideSyncAction({ local: localItem, remote: remoteItem, tombstone, base });
      let remoteContent = null;
      if (decision.conflict && decision.loser === "remote" && remoteItem) {
        remoteContent = await this.readRemoteNote(path);
        await this.saveConflictCopy(path, remoteContent.content, remoteItem.deviceId, remoteItem.mtime, false);
        totals.conflicts += 1;
      } else if (decision.conflict && decision.loser === "local" && localItem) {
        await this.saveConflictCopy(path, localItem.content, this.settings.deviceName, localItem.mtime, false);
        totals.conflicts += 1;
      }

      if (decision.action === "upload") {
        const result = await this.pushFile(localItem.file, Number(decision.cloud?.version || 0), false);
        const cloud = result.remote;
        states[path] = stateFrom(localItem, cloud);
        totals.uploaded += 1;
      } else if (decision.action === "download") {
        const note = remoteContent || await this.readRemoteNote(path);
        const written = await this.writeRemoteNote(path, note.content);
        states[path] = stateFrom(written, { ...remoteItem, hash: note.hash || remoteItem.hash });
        totals.downloaded += 1;
      } else if (decision.action === "deleteRemote") {
        const deletedAt = Number(this.settings.pendingDeletes.notes[path] || Date.now());
        const result = await this.deleteRemote(path, { mtime: deletedAt, baseVersion: Number(decision.cloud?.version || 0) });
        states[path] = stateFrom(null, { ...result, deleted: true });
        totals.remoteDeleted += 1;
      } else if (decision.action === "deleteLocal") {
        if (localItem) await this.deleteLocalFile(localItem.file);
        states[path] = stateFrom(null, decision.cloud);
        totals.localDeleted += 1;
      } else {
        states[path] = stateFrom(localItem, remoteSnapshot(remoteItem, tombstone));
      }
      delete this.settings.pendingDeletes.notes[path];
    }
  }

  async localAssetSnapshot(file, sourceNote) {
    const binary = await this.app.vault.readBinary(file);
    return { file, sourceNote, binary, hash: await sha256Hex(binary), mtime: Number(file.stat?.mtime || 0) };
  }

  async readRemoteAsset(path) {
    const response = await this.api(`/asset?path=${encodeURIComponent(path)}`);
    if (response.status < 200 || response.status >= 300) throw new Error(`Unable to download ${path}: HTTP ${response.status}`);
    return response.arrayBuffer;
  }

  async writeRemoteAsset(path, binary) {
    await this.ensureParentFolders(path);
    const existing = this.app.vault.getAbstractFileByPath(path);
    this.applyingRemote = true;
    try {
      if (existing instanceof TFile) await this.app.vault.modifyBinary(existing, binary);
      else await this.app.vault.createBinary(path, binary);
    } finally {
      this.applyingRemote = false;
    }
    const written = this.app.vault.getAbstractFileByPath(path);
    if (!(written instanceof TFile)) throw new Error(`Unable to write ${path}`);
    return this.localAssetSnapshot(written, null);
  }

  async syncAssets(manifest, totals) {
    if (!this.settings.syncAttachments) return;
    const local = new Map();
    for (const note of this.app.vault.getMarkdownFiles().filter((item) => this.shouldMirror(item))) {
      for (const attachment of this.getReferencedAttachments(note)) {
        if (!local.has(attachment.path)) local.set(attachment.path, await this.localAssetSnapshot(attachment, note));
      }
    }
    const remote = new Map(manifest.assets.map((item) => [item.path, item]));
    const tombstones = new Map(manifest.deletedAssets.map((item) => [item.path, item]));
    const states = this.settings.syncState.assets;
    const allPaths = new Set([...local.keys(), ...remote.keys(), ...tombstones.keys(), ...Object.keys(states)]);

    for (const path of [...allPaths].sort()) {
      if (!this.isSupportedAttachmentPath(path)) continue;
      this.currentSyncItem = `asset:${path}`;
      const localItem = local.get(path) || null;
      const remoteItem = remote.get(path) || null;
      const tombstone = tombstones.get(path) || null;
      const base = states[path] || null;
      if (!localItem && base?.localHash && this.settings.pendingDeletes.assets[path]) {
        base.localDeletedAt = this.settings.pendingDeletes.assets[path];
      }
      const decision = decideSyncAction({ local: localItem, remote: remoteItem, tombstone, base });
      let remoteBinary = null;
      if (decision.conflict && decision.loser === "remote" && remoteItem) {
        remoteBinary = await this.readRemoteAsset(path);
        await this.saveConflictCopy(path, remoteBinary, remoteItem.deviceId, remoteItem.mtime, true);
        totals.conflicts += 1;
      } else if (decision.conflict && decision.loser === "local" && localItem) {
        await this.saveConflictCopy(path, localItem.binary, this.settings.deviceName, localItem.mtime, true);
        totals.conflicts += 1;
      }

      if (decision.action === "upload") {
        const result = await this.uploadAttachment(localItem.sourceNote, localItem.file, Number(decision.cloud?.version || 0));
        states[path] = stateFrom(localItem, result.remote);
        totals.attachmentsUploaded += 1;
      } else if (decision.action === "download") {
        const binary = remoteBinary || await this.readRemoteAsset(path);
        const written = await this.writeRemoteAsset(path, binary);
        states[path] = stateFrom(written, remoteItem);
        totals.attachmentsDownloaded += 1;
      } else if (decision.action === "deleteRemote") {
        const deletedAt = Number(this.settings.pendingDeletes.assets[path] || Date.now());
        const result = await this.deleteRemoteAttachment(path, { mtime: deletedAt, baseVersion: Number(decision.cloud?.version || 0) });
        states[path] = stateFrom(null, { ...result, deleted: true });
        totals.remoteDeleted += 1;
      } else if (decision.action === "deleteLocal") {
        if (localItem) await this.deleteLocalFile(localItem.file);
        states[path] = stateFrom(null, decision.cloud);
        totals.localDeleted += 1;
      } else {
        states[path] = stateFrom(localItem, remoteSnapshot(remoteItem, tombstone));
      }
      delete this.settings.pendingDeletes.assets[path];
    }
  }

  async syncBidirectional(showNotice = false) {
    if (!this.settings.bidirectionalEnabled) return this.syncAll(showNotice, { changedOnly: false });
    if (!this.ready()) {
      if (showNotice) new Notice(this.t("notice.configFirst"));
      return;
    }
    if (this.bidirectionalPromise) {
      if (showNotice) new Notice(this.t("notice.syncRunning"));
      return this.bidirectionalPromise;
    }
    const totals = {
      uploaded: 0,
      downloaded: 0,
      attachmentsUploaded: 0,
      attachmentsDownloaded: 0,
      remoteDeleted: 0,
      localDeleted: 0,
      conflicts: 0,
    };
    this.bidirectionalPromise = (async () => {
      try {
        this.currentSyncItem = "manifest";
        const manifest = await this.fetchSyncManifest();
        await this.syncNotes(manifest, totals);
        await this.syncAssets(manifest, totals);
        this.settings.lastBidirectionalSyncAt = Date.now();
        this.settings.lastPeriodicSyncAt = this.settings.lastBidirectionalSyncAt;
        this.settings.lastConflictCount = totals.conflicts;
        this.settings.lastSyncError = "";
        this.currentSyncItem = "";
        await this.persistSettings();
        if (showNotice || totals.conflicts > 0) {
          new Notice(this.t("twoWay.summary", {
            uploaded: totals.uploaded + totals.attachmentsUploaded,
            downloaded: totals.downloaded + totals.attachmentsDownloaded,
            conflicts: totals.conflicts,
          }), totals.conflicts > 0 ? 12000 : 6000);
        }
        return totals;
      } catch (error) {
        const message = String(error?.message || error);
        this.settings.lastSyncError = `${this.currentSyncItem || "sync"}: ${message}`;
        await this.persistSettings();
        if (showNotice) new Notice(this.t("generic.errorPrefix", { message: this.settings.lastSyncError }), 12000);
        throw error;
      }
    })().finally(() => { this.bidirectionalPromise = null; });
    return this.bidirectionalPromise;
  }

  noteChangedSince(note, timestamp) {
    if (!timestamp || (note.stat?.mtime || 0) > timestamp) return true;
    if (!this.settings.syncAttachments) return false;
    return this.getReferencedAttachments(note).some((attachment) => (attachment.stat?.mtime || 0) > timestamp);
  }

  async syncAll(showNotice = false, options = {}) {
    if (!this.ready()) {
      if (showNotice) new Notice(this.t("notice.configFirst"));
      return;
    }
    if (this.fullSyncPromise) {
      if (showNotice) new Notice(this.t("notice.syncRunning"));
      return this.fullSyncPromise;
    }
    const changedOnly = options.changedOnly === true;
    const startedAt = Date.now();
    const previousSyncAt = this.settings.lastPeriodicSyncAt || 0;
    this.fullSyncPromise = (async () => {
      let files = this.app.vault.getMarkdownFiles().filter((file) => this.shouldMirror(file));
      if (changedOnly) files = files.filter((file) => this.noteChangedSince(file, previousSyncAt));
      let ok = 0;
      let failed = 0;
      let attachments = 0;
      let skipped = 0;
      for (const file of files) {
        try {
          const result = await this.pushFile(file);
          ok += 1;
          attachments += result.uploaded;
          skipped += result.skipped;
        } catch (error) {
          failed += 1;
          console.warn("AI Bridge full sync failed for", file.path, String(error?.message || error));
        }
      }
      if (failed === 0) {
        this.settings.lastPeriodicSyncAt = startedAt;
        await this.persistSettings();
      }
      if (showNotice) {
        const details = this.settings.syncAttachments
          ? this.t("sync.attachmentsDetail", { count: attachments })
            + (skipped ? this.t("sync.skippedDetail", { count: skipped }) : "")
          : "";
        const failures = failed ? this.t("sync.failedDetail", { count: failed }) : "";
        new Notice(this.t("sync.summary", { notes: ok, details, failures }));
      }
      return { ok, failed, attachments, skipped };
    })().finally(() => { this.fullSyncPromise = null; });
    return this.fullSyncPromise;
  }

  async maybeRunAutoSync() {
    if (!this.settings.autoSyncEnabled || !this.ready() || this.fullSyncPromise || this.bidirectionalPromise) return;
    const intervalMs = this.settings.autoSyncIntervalMinutes * 60 * 1000;
    const baseline = Math.max(
      this.settings.bidirectionalEnabled ? this.settings.lastBidirectionalSyncAt || 0 : this.settings.lastPeriodicSyncAt || 0,
      this.lastAutoAttemptAt || 0,
    );
    if (Date.now() - baseline < intervalMs) return;
    this.lastAutoAttemptAt = Date.now();
    if (this.settings.bidirectionalEnabled) await this.syncBidirectional(false);
    else await this.syncAll(false, { changedOnly: true });
  }

  async testConnection() {
    const response = await this.api("/health");
    if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}`);
    return response.json;
  }

  exportableSettings() {
    return {
      workerUrl: this.settings.workerUrl,
      token: this.settings.token,
      includePrefixes: this.settings.includePrefixes,
      debounceMs: this.settings.debounceMs,
      syncOnChange: this.settings.syncOnChange,
      autoSyncEnabled: this.settings.autoSyncEnabled,
      autoSyncIntervalMinutes: this.settings.autoSyncIntervalMinutes,
      syncAttachments: this.settings.syncAttachments,
      maxAttachmentMiB: this.settings.maxAttachmentMiB,
      bidirectionalEnabled: this.settings.bidirectionalEnabled,
    };
  }

  async createTransferLink(passphrase) {
    if (!this.ready()) throw new Error(this.t("error.configureFirst"));
    const encrypted = await encryptTransferPayload(this.exportableSettings(), passphrase);
    const params = new URLSearchParams({
      func: "settings",
      v: TRANSFER_VERSION,
      vault: this.app.vault.getName(),
      salt: encrypted.salt,
      iv: encrypted.iv,
      data: encrypted.data,
    });
    return `obsidian://${TRANSFER_PROTOCOL}?${params.toString()}`;
  }

  parseTransferLink(link) {
    const parsed = new URL(String(link || "").trim());
    if (parsed.protocol !== "obsidian:" || parsed.hostname !== TRANSFER_PROTOCOL) {
      throw new Error(this.t("error.notSettingsLink"));
    }
    return Object.fromEntries(parsed.searchParams.entries());
  }

  async handleTransferImport(params) {
    if (params.func !== "settings" || params.v !== TRANSFER_VERSION) {
      throw new Error(this.t("error.unsupportedLinkVersion"));
    }
    if (!params.salt || !params.iv || !params.data) throw new Error(this.t("error.incompleteLink"));
    const sourceVault = String(params.vault || "");
    const currentVault = this.app.vault.getName();
    if (params.setup === "1" && params.path) {
      const selectedPath = String(params.path).replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
      const currentPath = String(this.app.vault.adapter.getBasePath?.() || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
      if (!currentPath || selectedPath !== currentPath) {
        throw new Error("Open the vault selected in the Windows installer before importing settings.");
      }
    }
    if (sourceVault && sourceVault !== currentVault) {
      const confirmed = await openConfirmModal(
        this.app,
        this.t,
        this.t("confirm.differentVault.title"),
        this.t("confirm.differentVault.message", { sourceVault, currentVault }),
      );
      if (!confirmed) return;
    }
    const passphrase = await openPassphraseModal(this.app, this.t, {
      title: this.t("modal.import.title"),
      description: this.t("modal.import.description"),
      confirm: false,
      submitText: this.t("modal.import.submit"),
    });
    if (passphrase === null) return;
    let payload;
    try {
      payload = await decryptTransferPayload(params, passphrase);
    } catch {
      throw new Error(this.t("error.decryptFailed"));
    }
    this.settings = normalizeSettings(Object.assign({}, payload, {
      deviceId: this.settings.deviceId || runtimeWindow().crypto.randomUUID(),
      deviceName: payload.installerSetup === true ? payload.deviceName : this.settings.deviceName,
      syncState: { notes: {}, assets: {} },
      pendingDeletes: { notes: {}, assets: {} },
      lastPeriodicSyncAt: 0,
      lastBidirectionalSyncAt: 0,
      lastConflictCount: 0,
      lastConflictPath: "",
    }));
    await this.persistSettings();
    new Notice(this.t("notice.imported"));
    if (payload.installerSetup === true) {
      await this.testConnection();
      await this.runPreferredSync(true);
    }
  }
}

class AIBridgeSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("p", {
      text: this.plugin.t("settings.intro"),
    });

    new Setting(containerEl)
      .setName(this.plugin.t("workerUrl.name"))
      .setDesc(this.plugin.t("workerUrl.desc"))
      .addText((text) => text
        .setPlaceholder(this.plugin.t("workerUrl.placeholder"))
        .setValue(this.plugin.settings.workerUrl || "")
        .onChange(async (value) => {
          this.plugin.settings.workerUrl = value.trim();
          await this.plugin.persistSettings();
        }));

    new Setting(containerEl)
      .setName(this.plugin.t("writeToken.name"))
      .setDesc(this.plugin.t("writeToken.desc"))
      .addText((text) => {
        text.inputEl.type = "password";
        text.setValue(this.plugin.settings.token || "").onChange(async (value) => {
          this.plugin.settings.token = value.trim();
          await this.plugin.persistSettings();
        });
      });

    new Setting(containerEl)
      .setName(this.plugin.t("allowedFolders.name"))
      .setDesc(this.plugin.t("allowedFolders.desc"))
      .addTextArea((area) => {
        area.inputEl.rows = 6;
        area.setValue(this.plugin.settings.includePrefixes.join("\n"));
        area.onChange(async (value) => {
          this.plugin.settings.includePrefixes = value
            .split(/\r?\n/)
            .map(normalizePrefix)
            .filter(Boolean);
          await this.plugin.persistSettings();
        });
      });

    new Setting(containerEl)
      .setName(this.plugin.t("twoWay.name"))
      .setDesc(this.plugin.t("twoWay.desc"))
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.bidirectionalEnabled)
        .onChange(async (value) => {
          this.plugin.settings.bidirectionalEnabled = value;
          this.plugin.lastAutoAttemptAt = 0;
          await this.plugin.persistSettings();
          if (value && this.plugin.ready()) this.plugin.syncBidirectional(true).catch(() => {});
          this.display();
        }));

    new Setting(containerEl)
      .setName(this.plugin.t("deviceName.name"))
      .setDesc(this.plugin.t("deviceName.desc"))
      .addText((text) => text
        .setValue(this.plugin.settings.deviceName)
        .onChange(async (value) => {
          this.plugin.settings.deviceName = value.trim() || `Device-${this.plugin.settings.deviceId.slice(0, 6)}`;
          await this.plugin.persistSettings();
        }));

    const lastSync = this.plugin.settings.lastBidirectionalSyncAt
      ? new Date(this.plugin.settings.lastBidirectionalSyncAt).toLocaleString()
      : this.plugin.t("twoWay.never");
    const status = new Setting(containerEl)
      .setName(this.plugin.t("twoWay.status.name"))
      .setDesc(this.plugin.t("twoWay.status.desc", {
        time: lastSync,
        conflicts: this.plugin.settings.lastConflictCount,
      }));
    if (this.plugin.settings.lastConflictPath) {
      status.descEl.createEl("div", { text: this.plugin.t("twoWay.status.lastConflict", { path: this.plugin.settings.lastConflictPath }) });
    }
    if (this.plugin.settings.lastSyncError) {
      status.descEl.createEl("div", { text: this.plugin.t("generic.errorPrefix", { message: this.plugin.settings.lastSyncError }) });
    }

    new Setting(containerEl)
      .setName(this.plugin.t("syncOnChange.name"))
      .setDesc(this.plugin.t("syncOnChange.desc"))
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.syncOnChange)
        .onChange(async (value) => {
          this.plugin.settings.syncOnChange = value;
          await this.plugin.persistSettings();
        }));

    new Setting(containerEl)
      .setName(this.plugin.t("scheduledSync.name"))
      .setDesc(this.plugin.t("scheduledSync.desc"))
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.autoSyncEnabled)
        .onChange(async (value) => {
          this.plugin.settings.autoSyncEnabled = value;
          this.plugin.lastAutoAttemptAt = 0;
          await this.plugin.persistSettings();
        }));

    new Setting(containerEl)
      .setName(this.plugin.t("scheduledInterval.name"))
      .setDesc(this.plugin.t("scheduledInterval.desc"))
      .addText((text) => {
        text.inputEl.type = "number";
        text.inputEl.min = "1";
        text.inputEl.max = "1440";
        text.inputEl.step = "1";
        text.setValue(String(this.plugin.settings.autoSyncIntervalMinutes));
        text.onChange(async (value) => {
          this.plugin.settings.autoSyncIntervalMinutes = Math.round(clampNumber(value, 1, 1440, 15));
          this.plugin.lastAutoAttemptAt = 0;
          await this.plugin.persistSettings();
        });
      });

    new Setting(containerEl)
      .setName(this.plugin.t("attachments.name"))
      .setDesc(this.plugin.t("attachments.desc"))
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.syncAttachments)
        .onChange(async (value) => {
          this.plugin.settings.syncAttachments = value;
          await this.plugin.persistSettings();
        }));

    new Setting(containerEl)
      .setName(this.plugin.t("maxAttachment.name"))
      .setDesc(this.plugin.t("maxAttachment.desc", { limit: SERVER_MAX_ATTACHMENT_MIB }))
      .addText((text) => {
        text.inputEl.type = "number";
        text.inputEl.min = "1";
        text.inputEl.max = String(SERVER_MAX_ATTACHMENT_MIB);
        text.inputEl.step = "0.5";
        text.setValue(String(this.plugin.settings.maxAttachmentMiB));
        text.onChange(async (value) => {
          this.plugin.settings.maxAttachmentMiB = clampNumber(value, 1, SERVER_MAX_ATTACHMENT_MIB, 8);
          await this.plugin.persistSettings();
        });
      });

    new Setting(containerEl)
      .setName(this.plugin.t("testConnection.name"))
      .addButton((button) => button.setButtonText(this.plugin.t("testConnection.button")).onClick(async () => {
        try {
          await this.plugin.testConnection();
          new Notice(this.plugin.t("notice.connectionSuccess"));
        } catch (error) {
          new Notice(this.plugin.t("generic.errorPrefix", { message: String(error?.message || error) }));
        }
      }));

    new Setting(containerEl)
      .setName(this.plugin.t("fullSync.name"))
      .setDesc(this.plugin.t("fullSync.desc"))
      .addButton((button) => button.setButtonText(this.plugin.t("fullSync.button")).onClick(() => {
        this.plugin.runPreferredSync(true);
      }));

    new Setting(containerEl).setName(this.plugin.t("transfer.heading")).setHeading();
    containerEl.createEl("p", {
      text: this.plugin.t("transfer.intro"),
    });

    new Setting(containerEl)
      .setName(this.plugin.t("transfer.create.name"))
      .setDesc(this.plugin.t("transfer.create.desc"))
      .addButton((button) => button.setButtonText(this.plugin.t("transfer.create.button")).onClick(async () => {
        const passphrase = await openPassphraseModal(this.app, this.plugin.t, {
          title: this.plugin.t("transfer.create.modalTitle"),
          description: this.plugin.t("transfer.create.modalDesc"),
          confirm: true,
          submitText: this.plugin.t("transfer.create.submit"),
        });
        if (passphrase === null) return;
        try {
          const link = await this.plugin.createTransferLink(passphrase);
          await copyText(link);
          new Notice(this.plugin.t("notice.linkCopied"));
        } catch (error) {
          new Notice(this.plugin.t("generic.errorPrefix", { message: String(error?.message || error) }));
        }
      }));

    new Setting(containerEl)
      .setName(this.plugin.t("transfer.import.name"))
      .setDesc(this.plugin.t("transfer.import.desc"))
      .addButton((button) => button.setButtonText(this.plugin.t("transfer.import.button")).onClick(async () => {
        const link = await openPasteLinkModal(this.app, this.plugin.t);
        if (link === null) return;
        try {
          await this.plugin.handleTransferImport(this.plugin.parseTransferLink(link));
          this.display();
        } catch (error) {
          new Notice(this.plugin.t("generic.errorPrefix", { message: String(error?.message || error) }));
        }
      }));
  }
}

class PassphraseModal extends Modal {
  constructor(app, t, options, resolve) {
    super(app);
    this.t = t;
    this.options = options;
    this.resolve = resolve;
    this.settled = false;
  }
  finish(value) {
    if (this.settled) return;
    this.settled = true;
    this.resolve(value);
    this.close();
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: this.options.title });
    contentEl.createEl("p", { text: this.options.description });
    let first = "";
    let second = "";
    const firstSetting = new Setting(contentEl).setName(this.t("passphrase.label")).addText((text) => {
      text.inputEl.type = "password";
      text.onChange((value) => { first = value; });
      window.setTimeout(() => text.inputEl.focus(), 0);
    });
    if (this.options.confirm) {
      new Setting(contentEl).setName(this.t("passphrase.repeat")).addText((text) => {
        text.inputEl.type = "password";
        text.onChange((value) => { second = value; });
      });
    }
    const submit = () => {
      if (first.length < 8) {
        new Notice(this.t("notice.passphraseShort"));
        return;
      }
      if (this.options.confirm && first !== second) {
        new Notice(this.t("notice.passphraseMismatch"));
        return;
      }
      this.finish(first);
    };
    firstSetting.settingEl.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !this.options.confirm) submit();
    });
    new Setting(contentEl)
      .addButton((button) => button.setButtonText(this.t("button.cancel")).onClick(() => this.finish(null)))
      .addButton((button) => button.setCta().setButtonText(this.options.submitText).onClick(submit));
  }
  onClose() {
    this.contentEl.empty();
    if (!this.settled) {
      this.settled = true;
      this.resolve(null);
    }
  }
}

class PasteLinkModal extends Modal {
  constructor(app, t, resolve) {
    super(app);
    this.t = t;
    this.resolve = resolve;
    this.settled = false;
  }
  finish(value) {
    if (this.settled) return;
    this.settled = true;
    this.resolve(value);
    this.close();
  }
  onOpen() {
    this.contentEl.createEl("h2", { text: this.t("transfer.import.modalTitle") });
    let value = "";
    new Setting(this.contentEl).addTextArea((area) => {
      area.inputEl.rows = 6;
      area.onChange((next) => { value = next.trim(); });
      window.setTimeout(() => area.inputEl.focus(), 0);
    });
    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText(this.t("button.cancel")).onClick(() => this.finish(null)))
      .addButton((button) => button.setCta().setButtonText(this.t("transfer.import.continue")).onClick(() => {
        if (!value) {
          new Notice(this.t("notice.pasteFirst"));
          return;
        }
        this.finish(value);
      }));
  }
  onClose() {
    this.contentEl.empty();
    if (!this.settled) {
      this.settled = true;
      this.resolve(null);
    }
  }
}

class ConfirmModal extends Modal {
  constructor(app, t, title, message, resolve) {
    super(app);
    this.t = t;
    this.title = title;
    this.message = message;
    this.resolve = resolve;
    this.settled = false;
  }
  finish(value) {
    if (this.settled) return;
    this.settled = true;
    this.resolve(value);
    this.close();
  }
  onOpen() {
    this.contentEl.createEl("h2", { text: this.title });
    this.contentEl.createEl("p", { text: this.message });
    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText(this.t("button.cancel")).onClick(() => this.finish(false)))
      .addButton((button) => button.setWarning().setButtonText(this.t("button.importAnyway")).onClick(() => this.finish(true)));
  }
  onClose() {
    this.contentEl.empty();
    if (!this.settled) {
      this.settled = true;
      this.resolve(false);
    }
  }
}

function openPassphraseModal(app, t, options) {
  return new Promise((resolve) => new PassphraseModal(app, t, options, resolve).open());
}
function openPasteLinkModal(app, t) {
  return new Promise((resolve) => new PasteLinkModal(app, t, resolve).open());
}
function openConfirmModal(app, t, title, message) {
  return new Promise((resolve) => new ConfirmModal(app, t, title, message, resolve).open());
}

export default AIBridgePlugin;
