import { McpServer } from "@modelcontextprotocol/server";
import { OAuthProvider } from "@cloudflare/workers-oauth-provider";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";
import { noteReferencesAsset } from "./references.js";

const JSON_HEADERS = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
  "x-content-type-options": "nosniff",
};

const NOTE_PREFIX = "notes/";
const ASSET_PREFIX = "assets/";
const NOTE_TOMBSTONE_PREFIX = "sync/tombstones/notes/";
const ASSET_TOMBSTONE_PREFIX = "sync/tombstones/assets/";
const SYNC_SCHEMA_VERSION = 1;
const OAUTH_SCOPE = "mcp:read";
const CSRF_COOKIE = "__Host-obsidian_mirror_csrf";
const MEBIBYTE = 1024 * 1024;
const ATTACHMENT_TYPES = new Map([
  [".gif", { mime: "image/gif", maxBytes: 8 * MEBIBYTE, mode: "image" }],
  [".jpeg", { mime: "image/jpeg", maxBytes: 8 * MEBIBYTE, mode: "image" }],
  [".jpg", { mime: "image/jpeg", maxBytes: 8 * MEBIBYTE, mode: "image" }],
  [".pdf", { mime: "application/pdf", maxBytes: 8 * MEBIBYTE, mode: "pdf" }],
  [".png", { mime: "image/png", maxBytes: 8 * MEBIBYTE, mode: "image" }],
  [".webp", { mime: "image/webp", maxBytes: 8 * MEBIBYTE, mode: "image" }],
]);

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

function html(body, status = 200, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      "content-type": "text/html; charset=utf-8",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      ...extraHeaders,
    },
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function cookieValue(request, name) {
  const cookie = request.headers.get("cookie") || "";
  for (const part of cookie.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return null;
}

async function secureSecretEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const a = new Uint8Array(leftHash);
  const b = new Uint8Array(rightHash);
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

function authorizationErrorRedirect(oauthRequest, error, description) {
  const redirect = new URL(oauthRequest.redirectUri);
  redirect.searchParams.set("error", error);
  redirect.searchParams.set("error_description", description);
  redirect.searchParams.set("state", oauthRequest.state);
  if (oauthRequest.issuer) redirect.searchParams.set("iss", oauthRequest.issuer);
  return Response.redirect(redirect.toString(), 302);
}

function renderAuthorizationPage(request, client, csrf, error = "", status = 200) {
  const url = new URL(request.url);
  const action = escapeHtml(`${url.pathname}${url.search}`);
  const clientName = escapeHtml(client.clientName || "ChatGPT MCP client");
  const errorBlock = error ? `<p class="error" role="alert">${escapeHtml(error)}</p>` : "";
  const body = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>授权 Obsidian AI Mirror</title>
  <style>
    :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #111827; color: #f9fafb; }
    main { width: min(92vw, 430px); box-sizing: border-box; padding: 28px; border: 1px solid #374151; border-radius: 18px; background: #1f2937; box-shadow: 0 18px 60px #0008; }
    h1 { margin: 0 0 12px; font-size: 1.45rem; }
    p { line-height: 1.55; color: #d1d5db; }
    code { color: #bfdbfe; }
    label { display: block; margin: 22px 0 8px; font-weight: 650; }
    input { width: 100%; box-sizing: border-box; padding: 12px; border: 1px solid #4b5563; border-radius: 10px; background: #111827; color: #fff; font: inherit; }
    .actions { display: flex; gap: 10px; margin-top: 22px; }
    button { flex: 1; padding: 11px; border: 0; border-radius: 10px; font: inherit; font-weight: 700; cursor: pointer; }
    button[value="allow"] { background: #3b82f6; color: #fff; }
    button[value="deny"] { background: #374151; color: #e5e7eb; }
    .error { color: #fecaca; background: #7f1d1d; padding: 10px; border-radius: 8px; }
    .scope { font-size: .92rem; color: #9ca3af; }
  </style>
</head>
<body>
  <main>
    <h1>授权读取 AI 镜像</h1>
    <p><strong>${clientName}</strong> 请求只读访问独立的 Obsidian AI Mirror。</p>
    <p class="scope">权限：搜索和读取已筛选上传的笔记与允许的附件。不能写入镜像，也不能访问加密主库。</p>
    ${errorBlock}
    <form method="post" action="${action}">
      <input type="hidden" name="csrf" value="${escapeHtml(csrf)}">
      <label for="password">镜像读取密码</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required autofocus>
      <div class="actions">
        <button type="submit" name="decision" value="deny" formnovalidate>拒绝</button>
        <button type="submit" name="decision" value="allow">授权</button>
      </div>
    </form>
  </main>
</body>
</html>`;
  return html(body, status, {
    "set-cookie": `${CSRF_COOKIE}=${csrf}; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=600`,
  });
}

function bearer(request) {
  const header = request.headers.get("authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
}

function authorizationMode(request, env) {
  const token = bearer(request);
  if (env.MIRROR_TOKEN && token === env.MIRROR_TOKEN) return "write";
  if (env.MIRROR_READ_KEY && token === env.MIRROR_READ_KEY) return "read";
  return null;
}

function cleanRelativePath(path) {
  if (typeof path !== "string") return null;
  const value = path.replace(/\\/g, "/").replace(/^\/+/, "").trim();
  if (!value || value.includes("\0")) return null;
  const parts = value.split("/");
  if (parts.some((part) => !part || part === "." || part === ".." || part.startsWith("."))) return null;
  return parts.join("/");
}

function cleanNotePath(path) {
  const value = cleanRelativePath(path);
  if (!value || !value.toLowerCase().endsWith(".md")) return null;
  return value;
}

function attachmentPolicy(path) {
  const value = cleanRelativePath(path);
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot < 0) return null;
  const policy = ATTACHMENT_TYPES.get(value.slice(dot).toLowerCase());
  return policy ? { ...policy, path: value } : null;
}

function noteKey(path) {
  return `${NOTE_PREFIX}${path}`;
}

function assetKey(path) {
  return `${ASSET_PREFIX}${path}`;
}

function noteTombstoneKey(path) {
  return `${NOTE_TOMBSTONE_PREFIX}${path}`;
}

function assetTombstoneKey(path) {
  return `${ASSET_TOMBSTONE_PREFIX}${path}`;
}

function metadataNumber(object, key, fallback = 0) {
  return Number(object?.customMetadata?.[key] || fallback || 0);
}

function syncMetadata(object, prefix) {
  return {
    path: object.key.slice(prefix.length),
    mtime: metadataNumber(object, "mtime", object.uploaded?.getTime?.()),
    version: metadataNumber(object, "version", 1),
    hash: object.customMetadata?.hash || null,
    deviceId: object.customMetadata?.deviceId || "legacy",
  };
}

async function sha256Hex(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function textResult(data) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function toolError(message) {
  return { isError: true, content: [{ type: "text", text: message }] };
}

async function listAll(env, prefix) {
  let cursor;
  const objects = [];
  do {
    const page = await env.AI_MIRROR.list({
      prefix,
      cursor,
      limit: 1000,
      include: ["customMetadata"],
    });
    objects.push(...page.objects);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return objects;
}

async function getNote(env, path) {
  const obj = await env.AI_MIRROR.get(noteKey(path));
  if (!obj) return null;
  const content = await obj.text();
  return {
    path,
    content,
    mtime: Number(obj.customMetadata?.mtime || 0),
    version: Number(obj.customMetadata?.version || 1),
    hash: obj.customMetadata?.hash || await sha256Hex(content),
    deviceId: obj.customMetadata?.deviceId || "legacy",
    uploaded: obj.uploaded?.toISOString?.() || null,
  };
}

async function syncManifest(env) {
  const [notes, assets, deletedNotes, deletedAssets] = await Promise.all([
    listAll(env, NOTE_PREFIX),
    listAll(env, ASSET_PREFIX),
    listAll(env, NOTE_TOMBSTONE_PREFIX),
    listAll(env, ASSET_TOMBSTONE_PREFIX),
  ]);
  return {
    schema: SYNC_SCHEMA_VERSION,
    notes: notes.map((object) => syncMetadata(object, NOTE_PREFIX)),
    assets: assets.map((object) => ({
      ...syncMetadata(object, ASSET_PREFIX),
      sourceNote: object.customMetadata?.sourceNote || null,
      contentType: object.customMetadata?.contentType || "application/octet-stream",
      size: Number(object.customMetadata?.size || object.size || 0),
    })),
    deletedNotes: deletedNotes.map((object) => syncMetadata(object, NOTE_TOMBSTONE_PREFIX)),
    deletedAssets: deletedAssets.map((object) => syncMetadata(object, ASSET_TOMBSTONE_PREFIX)),
  };
}

function incomingSyncFields(source = {}) {
  return {
    deviceId: String(source.deviceId || "legacy").slice(0, 120),
    baseVersion: Math.max(0, Number(source.baseVersion || 0)),
    mtime: Math.max(0, Number(source.mtime || Date.now())),
  };
}

function conflictResponse(current, reason = "remote version changed") {
  return json({ error: "sync conflict", reason, current }, 409);
}

async function recentNotes(env, days, limit) {
  const since = Date.now() - days * 86400000;
  const objects = await listAll(env, NOTE_PREFIX);
  return objects
    .map((object) => ({
      path: object.key.slice(NOTE_PREFIX.length),
      mtime: Number(object.customMetadata?.mtime || object.uploaded?.getTime?.() || 0),
    }))
    .filter((row) => row.mtime >= since)
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, limit);
}

async function searchNotes(env, query, limit) {
  const q = query.trim().toLowerCase();
  const objects = await listAll(env, NOTE_PREFIX);
  const matches = [];
  for (const object of objects) {
    if (matches.length >= limit) break;
    const path = object.key.slice(NOTE_PREFIX.length);
    const pathHit = path.toLowerCase().includes(q);
    const note = await env.AI_MIRROR.get(object.key);
    if (!note) continue;
    const text = await note.text();
    const lower = text.toLowerCase();
    const bodyHit = lower.includes(q);
    if (!pathHit && !bodyHit) continue;
    const index = lower.indexOf(q);
    const start = Math.max(0, index < 0 ? 0 : index - 160);
    matches.push({
      path,
      mtime: Number(object.customMetadata?.mtime || 0),
      snippet: text.slice(start, start + 700),
    });
  }
  return matches;
}

function pdfOptedIn(content) {
  const frontmatter = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1] || "";
  return /^ai-attachments:\s*(true|yes|on)\s*$/im.test(frontmatter);
}

async function listNoteAttachments(env, notePath) {
  const objects = await listAll(env, ASSET_PREFIX);
  return objects
    .filter((object) => object.customMetadata?.sourceNote === notePath)
    .map((object) => ({
      path: object.key.slice(ASSET_PREFIX.length),
      contentType: object.customMetadata?.contentType || "application/octet-stream",
      size: Number(object.customMetadata?.size || object.size || 0),
      mtime: Number(object.customMetadata?.mtime || 0),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  }
  return btoa(binary);
}

async function readAttachmentForMcp(env, path) {
  const policy = attachmentPolicy(path);
  if (!policy) return toolError("Attachment path or type is not allowed.");
  const object = await env.AI_MIRROR.get(assetKey(policy.path));
  if (!object) return toolError("Attachment not found in the AI mirror.");
  if (object.size > policy.maxBytes) return toolError("Attachment exceeds the mirror retrieval limit.");
  const mimeType = object.customMetadata?.contentType || object.httpMetadata?.contentType || policy.mime;
  const data = arrayBufferToBase64(await object.arrayBuffer());
  if (policy.mode === "image") return { content: [{ type: "image", data, mimeType }] };
  return {
    content: [{
      type: "resource",
      resource: { uri: `mirror://attachment/${encodeURIComponent(policy.path)}`, blob: data, mimeType },
    }],
  };
}

function createMirrorServer(env) {
  const server = new McpServer({ name: "Context Anywhere", version: "4.0.0" });
  const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

  server.registerTool(
    "search_notes",
    {
      title: "Search mirrored Obsidian notes",
      description: "Search only the selected Markdown notes in the separate AI mirror. It cannot access the encrypted main vault.",
      inputSchema: {
        query: z.string().min(1).max(100),
        limit: z.number().int().min(1).max(50).optional(),
      },
      annotations: readOnly,
    },
    async ({ query, limit }) => textResult({ query, matches: await searchNotes(env, query, limit ?? 20) }),
  );

  server.registerTool(
    "get_note",
    {
      title: "Read a mirrored Obsidian note",
      description: "Read one Markdown note by its vault-relative path from the separate AI mirror.",
      inputSchema: { path: z.string().min(1).max(500) },
      annotations: readOnly,
    },
    async ({ path }) => {
      const clean = cleanNotePath(path);
      if (!clean) return toolError("Invalid Markdown note path.");
      const note = await getNote(env, clean);
      return note ? textResult(note) : toolError("Note not found in the AI mirror.");
    },
  );

  server.registerTool(
    "recent_notes",
    {
      title: "List recent mirrored Obsidian notes",
      description: "List recently modified Markdown notes in the separate AI mirror.",
      inputSchema: {
        days: z.number().int().min(1).max(365).optional(),
        limit: z.number().int().min(1).max(100).optional(),
      },
      annotations: readOnly,
    },
    async ({ days, limit }) => textResult({
      days: days ?? 1,
      notes: await recentNotes(env, days ?? 1, limit ?? 50),
    }),
  );

  server.registerTool(
    "list_note_attachments",
    {
      title: "List mirrored attachments for a note",
      description: "List only referenced, allow-listed attachments already copied to the separate AI mirror.",
      inputSchema: { notePath: z.string().min(1).max(500) },
      annotations: readOnly,
    },
    async ({ notePath }) => {
      const clean = cleanNotePath(notePath);
      if (!clean) return toolError("Invalid Markdown note path.");
      return textResult({ notePath: clean, attachments: await listNoteAttachments(env, clean) });
    },
  );

  server.registerTool(
    "read_attachment",
    {
      title: "Read a mirrored note attachment",
      description: "Read one allow-listed image or opted-in PDF already copied to the separate AI mirror.",
      inputSchema: { path: z.string().min(1).max(500) },
      annotations: readOnly,
    },
    async ({ path }) => readAttachmentForMcp(env, path),
  );

  return server;
}

async function handleRest(request, env, url, auth) {
  if (request.method === "GET" && url.pathname === "/health") {
    return json({ ok: true, service: "obsidian-ai-mirror", mcp: "/mcp" });
  }

  if (request.method === "GET" && url.pathname === "/sync/manifest") {
    return json(await syncManifest(env));
  }

  if (request.method === "GET" && url.pathname === "/recent") {
    const days = Math.min(365, Math.max(1, Number(url.searchParams.get("days") || 1)));
    return json({ days, notes: await recentNotes(env, days, 100) });
  }

  if (request.method === "GET" && url.pathname === "/search") {
    const query = (url.searchParams.get("q") || "").trim();
    if (!query || query.length > 100) return json({ error: "invalid q" }, 400);
    return json({ q: query, matches: await searchNotes(env, query, 50) });
  }

  if (request.method === "GET" && url.pathname === "/note") {
    const path = cleanNotePath(url.searchParams.get("path"));
    if (!path) return json({ error: "invalid path" }, 400);
    const note = await getNote(env, path);
    return note ? json(note) : json({ error: "not found" }, 404);
  }

  if (request.method === "PUT" && url.pathname === "/note") {
    if (auth !== "write") return json({ error: "write token required" }, 403);
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid json" }, 400);
    }
    const path = cleanNotePath(body.path);
    if (!path || typeof body.content !== "string") return json({ error: "invalid note" }, 400);
    const sync = incomingSyncFields(body);
    const key = noteKey(path);
    const tombstoneKey = noteTombstoneKey(path);
    const [existing, tombstone] = await Promise.all([env.AI_MIRROR.head(key), env.AI_MIRROR.head(tombstoneKey)]);
    const currentVersion = Math.max(metadataNumber(existing, "version"), metadataNumber(tombstone, "version"));
    const currentMtime = Math.max(metadataNumber(existing, "mtime"), metadataNumber(tombstone, "mtime"));
    if (sync.baseVersion && sync.baseVersion !== currentVersion) {
      return conflictResponse({ path, version: currentVersion, mtime: currentMtime });
    }
    if (currentMtime > sync.mtime) {
      return conflictResponse({ path, version: currentVersion, mtime: currentMtime }, "remote is newer");
    }
    const hash = await sha256Hex(body.content);
    if (existing?.customMetadata?.hash === hash) {
      return json({ ok: true, unchanged: true, path, mtime: metadataNumber(existing, "mtime"), version: metadataNumber(existing, "version", 1), hash });
    }
    const version = currentVersion + 1;
    await env.AI_MIRROR.put(noteKey(path), body.content, {
      httpMetadata: { contentType: "text/markdown; charset=utf-8" },
      customMetadata: {
        mtime: String(sync.mtime),
        version: String(version),
        hash,
        deviceId: sync.deviceId,
      },
    });
    await env.AI_MIRROR.delete(tombstoneKey);
    return json({ ok: true, path, mtime: sync.mtime, version, hash, deviceId: sync.deviceId });
  }

  if (request.method === "DELETE" && url.pathname === "/note") {
    if (auth !== "write") return json({ error: "write token required" }, 403);
    const path = cleanNotePath(url.searchParams.get("path"));
    if (!path) return json({ error: "invalid path" }, 400);
    const sync = incomingSyncFields(Object.fromEntries(url.searchParams.entries()));
    const key = noteKey(path);
    const tombstoneKey = noteTombstoneKey(path);
    const [existing, tombstone] = await Promise.all([env.AI_MIRROR.head(key), env.AI_MIRROR.head(tombstoneKey)]);
    const currentVersion = Math.max(metadataNumber(existing, "version"), metadataNumber(tombstone, "version"));
    const currentMtime = Math.max(metadataNumber(existing, "mtime"), metadataNumber(tombstone, "mtime"));
    if (sync.baseVersion && sync.baseVersion !== currentVersion) {
      return conflictResponse({ path, version: currentVersion, mtime: currentMtime });
    }
    if (currentMtime > sync.mtime) {
      return conflictResponse({ path, version: currentVersion, mtime: currentMtime }, "remote is newer");
    }
    const version = currentVersion + 1;
    await env.AI_MIRROR.put(tombstoneKey, "", {
      customMetadata: {
        mtime: String(sync.mtime),
        version: String(version),
        hash: "",
        deviceId: sync.deviceId,
      },
    });
    await env.AI_MIRROR.delete(key);
    return json({ ok: true, path, deleted: true, mtime: sync.mtime, version, deviceId: sync.deviceId });
  }

  if (request.method === "GET" && url.pathname === "/assets") {
    const notePath = cleanNotePath(url.searchParams.get("note"));
    if (!notePath) return json({ error: "invalid note" }, 400);
    return json({ notePath, attachments: await listNoteAttachments(env, notePath) });
  }

  if (request.method === "GET" && url.pathname === "/asset") {
    const policy = attachmentPolicy(url.searchParams.get("path"));
    if (!policy) return json({ error: "invalid attachment path or type" }, 400);
    const object = await env.AI_MIRROR.get(assetKey(policy.path));
    if (!object) return json({ error: "not found" }, 404);
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("cache-control", "private, no-store");
    headers.set("content-type", object.customMetadata?.contentType || headers.get("content-type") || policy.mime);
    headers.set("x-mirror-mtime", object.customMetadata?.mtime || "0");
    headers.set("x-mirror-version", object.customMetadata?.version || "1");
    headers.set("x-mirror-hash", object.customMetadata?.hash || "");
    headers.set("x-mirror-device", object.customMetadata?.deviceId || "legacy");
    headers.set("x-content-type-options", "nosniff");
    return new Response(object.body, { headers });
  }

  if (request.method === "PUT" && url.pathname === "/asset") {
    if (auth !== "write") return json({ error: "write token required" }, 403);
    const policy = attachmentPolicy(url.searchParams.get("path"));
    const sourceNote = cleanNotePath(url.searchParams.get("note"));
    if (!policy || !sourceNote) return json({ error: "invalid attachment or source note" }, 400);
    const contentType = (request.headers.get("content-type") || "").split(";")[0].toLowerCase();
    if (contentType !== policy.mime) return json({ error: "content type does not match attachment extension" }, 415);
    const length = Number(request.headers.get("content-length") || 0);
    if (length > policy.maxBytes) return json({ error: "attachment too large" }, 413);

    const note = await getNote(env, sourceNote);
    if (!note) return json({ error: "source note must be mirrored first" }, 409);
    if (!noteReferencesAsset(note.content, sourceNote, policy.path)) {
      return json({ error: "source note does not reference this attachment" }, 409);
    }
    if (policy.mode === "pdf" && !pdfOptedIn(note.content)) {
      return json({ error: "PDF requires ai-attachments: true in note frontmatter" }, 403);
    }

    const bytes = await request.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > policy.maxBytes) return json({ error: "invalid attachment size" }, 413);
    const sync = incomingSyncFields({
      deviceId: request.headers.get("x-mirror-device"),
      baseVersion: request.headers.get("x-mirror-base-version"),
      mtime: request.headers.get("x-mirror-mtime"),
    });
    const key = assetKey(policy.path);
    const tombstoneKey = assetTombstoneKey(policy.path);
    const [existing, tombstone] = await Promise.all([env.AI_MIRROR.head(key), env.AI_MIRROR.head(tombstoneKey)]);
    const currentVersion = Math.max(metadataNumber(existing, "version"), metadataNumber(tombstone, "version"));
    const currentMtime = Math.max(metadataNumber(existing, "mtime"), metadataNumber(tombstone, "mtime"));
    if (sync.baseVersion && sync.baseVersion !== currentVersion) {
      return conflictResponse({ path: policy.path, version: currentVersion, mtime: currentMtime });
    }
    if (currentMtime > sync.mtime) {
      return conflictResponse({ path: policy.path, version: currentVersion, mtime: currentMtime }, "remote is newer");
    }
    await env.AI_MIRROR.put(assetKey(policy.path), bytes, {
      httpMetadata: { contentType },
      customMetadata: {
        contentType,
        mtime: String(sync.mtime),
        version: String(currentVersion + 1),
        hash: await sha256Hex(bytes),
        deviceId: sync.deviceId,
        size: String(bytes.byteLength),
        sourceNote,
      },
    });
    await env.AI_MIRROR.delete(tombstoneKey);
    return json({ ok: true, path: policy.path, sourceNote, size: bytes.byteLength, mtime: sync.mtime, version: currentVersion + 1, deviceId: sync.deviceId });
  }

  if (request.method === "DELETE" && url.pathname === "/asset") {
    if (auth !== "write") return json({ error: "write token required" }, 403);
    const policy = attachmentPolicy(url.searchParams.get("path"));
    if (!policy) return json({ error: "invalid attachment path or type" }, 400);
    const sync = incomingSyncFields(Object.fromEntries(url.searchParams.entries()));
    const key = assetKey(policy.path);
    const tombstoneKey = assetTombstoneKey(policy.path);
    const [existing, tombstone] = await Promise.all([env.AI_MIRROR.head(key), env.AI_MIRROR.head(tombstoneKey)]);
    const currentVersion = Math.max(metadataNumber(existing, "version"), metadataNumber(tombstone, "version"));
    const currentMtime = Math.max(metadataNumber(existing, "mtime"), metadataNumber(tombstone, "mtime"));
    if (sync.baseVersion && sync.baseVersion !== currentVersion) {
      return conflictResponse({ path: policy.path, version: currentVersion, mtime: currentMtime });
    }
    if (currentMtime > sync.mtime) {
      return conflictResponse({ path: policy.path, version: currentVersion, mtime: currentMtime }, "remote is newer");
    }
    const version = currentVersion + 1;
    await env.AI_MIRROR.put(tombstoneKey, "", {
      customMetadata: {
        mtime: String(sync.mtime),
        version: String(version),
        hash: "",
        deviceId: sync.deviceId,
      },
    });
    await env.AI_MIRROR.delete(key);
    return json({ ok: true, path: policy.path, deleted: true, mtime: sync.mtime, version, deviceId: sync.deviceId });
  }

  return json({ error: "not found" }, 404);
}

async function handleAuthorization(request, env) {
  let oauthRequest;
  try {
    oauthRequest = await env.OAUTH_PROVIDER.parseAuthRequest(request.clone());
  } catch {
    return html("<h1>无效的 OAuth 授权请求</h1>", 400);
  }

  const client = await env.OAUTH_PROVIDER.lookupClient(oauthRequest.clientId);
  if (!client) return html("<h1>未知的 OAuth 客户端</h1>", 400);

  if (request.method === "GET") {
    return renderAuthorizationPage(request, client, crypto.randomUUID());
  }

  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const form = await request.formData();
  const csrf = String(form.get("csrf") || "");
  const csrfCookie = cookieValue(request, CSRF_COOKIE);
  if (!csrf || !csrfCookie || !(await secureSecretEqual(csrf, csrfCookie))) {
    return html("<h1>授权页面已失效，请返回 ChatGPT 重试</h1>", 403);
  }

  if (form.get("decision") === "deny") {
    return authorizationErrorRedirect(oauthRequest, "access_denied", "The vault owner denied access.");
  }

  const password = String(form.get("password") || "");
  if (!env.MIRROR_READ_KEY || !(await secureSecretEqual(password, env.MIRROR_READ_KEY))) {
    return renderAuthorizationPage(request, client, crypto.randomUUID(), "读取密码不正确。", 401);
  }

  const grantedScopes = oauthRequest.scope.filter((scope) => scope === OAUTH_SCOPE);
  const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
    request: oauthRequest,
    userId: "obsidian-vault-owner",
    metadata: { clientName: client.clientName || "ChatGPT MCP client" },
    scope: grantedScopes,
    props: { access: "read" },
  });
  return Response.redirect(redirectTo, 302);
}

const mcpApiHandler = {
  async fetch(request, env, ctx) {
    return createMcpHandler(() => createMirrorServer(env), {
      route: "/mcp",
      corsOptions: false,
    })(request, env, ctx);
  },
};

const defaultHandler = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/authorize") return handleAuthorization(request, env);

    const auth = authorizationMode(request, env);
    if (!auth) return json({ error: "unauthorized" }, 401);
    return handleRest(request, env, url, auth);
  },
};

export default new OAuthProvider({
  apiRoute: "/mcp",
  apiHandler: mcpApiHandler,
  defaultHandler,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/oauth/token",
  clientRegistrationEndpoint: "/oauth/register",
  scopesSupported: [OAUTH_SCOPE],
  allowPlainPKCE: false,
  allowImplicitFlow: false,
  clientIdMetadataDocumentEnabled: true,
  // When resourceMetadata is omitted, the provider derives the public origin
  // and canonical /mcp resource from each request instead of hard-coding a deployment URL.
});
