import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { randomBytes, webcrypto } from 'node:crypto';
import path from 'node:path';
import { shouldMirrorPath, isConfigPath, isConflictPath } from '../../src/rules.js';
import { powershell } from './storage.mjs';

export async function inspectVault(directory, configDir = '.obsidian') {
  if (!directory || !path.isAbsolute(directory)) throw new Error('请选择 Obsidian 知识库所在的完整目录。');
  if (!/^[^\\/:*?"<>|]+$/.test(configDir) || configDir === '.' || configDir === '..') throw new Error('Obsidian 配置目录名称无效。');
  const root = await realpath(directory);
  const pluginDir = path.join(root, configDir, 'plugins', 'ai-bridge');
  let manifest;
  try {
    manifest = JSON.parse(await readFile(path.join(pluginDir, 'manifest.json'), 'utf8'));
    await stat(path.join(pluginDir, 'main.js'));
  } catch { throw new Error('此知识库没有安装 AI Bridge，请在 Obsidian 第三方插件里安装后再试。'); }
  if (manifest.id !== 'ai-bridge') throw new Error('插件标识不匹配。');
  const enabled = await readFile(path.join(root, configDir, 'community-plugins.json'), 'utf8').then(JSON.parse).catch(() => []);
  return { path: root, name: path.basename(root), configDir, version: manifest.version, enabled: enabled.includes('ai-bridge') };
}

export function settingsFrom(options) {
  if (typeof options.deviceName !== 'string' || !options.deviceName.trim() || options.deviceName.length > 100) throw new Error('请填写设备名称（最多 100 字）。');
  const prefixes = String(options.includePrefixes || '').split(/\r?\n/).map(x => x.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')).filter(Boolean);
  if (prefixes.some(x => x.split('/').some(p => ['.', '..'].includes(p)) || /^[A-Za-z]:/.test(x))) throw new Error('镜像目录需为知识库内的相对路径，不能包含 ..。');
  const interval = Number(options.autoSyncIntervalMinutes ?? 15);
  const maxAttachment = Number(options.maxAttachmentMiB ?? 8);
  const debounce = Number(options.debounceMs ?? 1200);
  if (!Number.isInteger(interval) || interval < 1 || interval > 1440) throw new Error('定时同步间隔需为 1–1440 分钟。');
  if (maxAttachment < 1 || maxAttachment > 8 || !Number.isFinite(maxAttachment)) throw new Error('附件上限需为 1–8 MiB。');
  if (!Number.isInteger(debounce) || debounce < 250 || debounce > 10000) throw new Error('修改后等待时间需为 250–10000 毫秒。');
  if (!prefixes.length && options.mirrorAll !== true) throw new Error('请选择镜像目录，或明确勾选“允许所有 Markdown”。');
  return { includePrefixes: prefixes, deviceName: options.deviceName.trim(), debounceMs: debounce,
    syncOnChange: options.syncOnChange !== false, autoSyncEnabled: options.autoSyncEnabled === true,
    autoSyncIntervalMinutes: interval, syncAttachments: options.syncAttachments === true, maxAttachmentMiB: maxAttachment,
    bidirectionalEnabled: options.bidirectionalEnabled === true };
}

export async function previewVault(vault, settings) {
  const folders = new Set(); let notes = 0;
  async function walk(relative = '') {
    const entries = await readdir(path.join(vault.path, relative), { withFileTypes: true });
    for (const entry of entries) {
      const file = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink() || isConfigPath(file, vault.configDir) || isConflictPath(file)) continue;
      if (entry.isDirectory()) { folders.add(file); await walk(file); }
      else if (entry.isFile() && shouldMirrorPath(file, settings.includePrefixes, vault.configDir)) notes++;
    }
  }
  await walk(); return { notes, folders: [...folders].sort() };
}

export async function transferLink(vault, settings, passphrase) {
  if (typeof passphrase !== 'string' || passphrase.length < 8) throw new Error('临时导入密码至少需要 8 个字符。');
  const salt = randomBytes(16), iv = randomBytes(12);
  const material = await webcrypto.subtle.importKey('raw', Buffer.from(passphrase), 'PBKDF2', false, ['deriveKey']);
  const key = await webcrypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const ciphertext = Buffer.from(await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, Buffer.from(JSON.stringify(settings))));
  const query = new URLSearchParams({ func: 'settings', v: '1', vault: vault.name, setup: '1', path: vault.path,
    salt: salt.toString('base64url'), iv: iv.toString('base64url'), data: ciphertext.toString('base64url') });
  // Obsidian's vault routing decodes percent escapes, but does not decode form-style '+'.
  return `obsidian://ai-bridge?${query.toString().replaceAll('+', '%20')}`;
}

export async function verifyImport(vault, expected) {
  const data = await readFile(path.join(vault.path, vault.configDir, 'plugins', 'ai-bridge', 'data.json'), 'utf8').then(JSON.parse).catch(() => ({}));
  const matched = Object.entries(expected).every(([key, value]) => JSON.stringify(data[key]) === JSON.stringify(value));
  return { imported: matched, syncError: matched ? String(data.lastSyncError || '').slice(0, 200) : '', lastSyncAt: matched ? Math.max(data.lastPeriodicSyncAt || 0, data.lastBidirectionalSyncAt || 0) : 0 };
}

export async function openObsidian(vault, uri) {
  // Open the explicitly selected vault before delivering its encrypted import link.
  await powershell(`$setupUri = [Console]::In.ReadToEnd(); Start-Process -FilePath $setupUri`, `obsidian://open?path=${encodeURIComponent(vault.path)}`);
  await new Promise(resolve => setTimeout(resolve, 1200));
  await powershell(`$setupUri = [Console]::In.ReadToEnd(); Start-Process -FilePath $setupUri`, uri);
}
