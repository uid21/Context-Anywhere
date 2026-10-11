import { readFile, readdir, realpath, stat, writeFile, rm } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
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
  } catch { throw new Error('这个知识库尚未安装 AI Bridge。请在 Obsidian 社区插件中安装并启用，再回来检查。'); }
  if (manifest.id !== 'ai-bridge') throw new Error('插件标识不匹配。');
  const enabled = await readFile(path.join(root, configDir, 'community-plugins.json'), 'utf8').then(JSON.parse).catch(() => []);
  const version = String(manifest.version).split('.').map(Number);
  const localImportSupported = version[0] > 0 || version[1] > 4 || (version[1] === 4 && version[2] >= 2);
  return { path: root, name: path.basename(root), configDir, version: manifest.version, enabled: enabled.includes('ai-bridge'), localImportSupported };
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
  if (!prefixes.length && options.mirrorAll !== true) throw new Error('请填写要同步的文件夹或笔记，或勾选同步全部 Markdown 笔记。');
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

export async function prepareImport(vault, settings) {
  if (!vault.enabled) throw new Error('请先在选中的知识库启用 AI Bridge。');
  if (!vault.localImportSupported) throw new Error('当前 AI Bridge 版本暂不支持向导导入。请更新插件，重新打开 Obsidian 后重试。');
  const id = randomBytes(24).toString('hex');
  const directory = path.join(vault.path, vault.configDir, 'plugins', 'ai-bridge');
  // Remove only expired handoffs from this plugin's directory, including those
  // left by a previously interrupted wizard. Never touch plugin settings.
  for (const name of await readdir(directory)) {
    if (!/^setup-[a-f0-9]{48}\.json$/.test(name)) continue;
    const file = path.join(directory, name);
    const old = await readFile(file, 'utf8').then(JSON.parse).catch(() => null);
    if (old?.expiresAt <= Date.now()) await rm(file, { force: true });
  }
  const file = path.join(directory, `setup-${id}.json`);
  await writeFile(file, JSON.stringify({ version: 1, vaultPath: vault.path, expiresAt: Date.now() + 120_000, settings }), { flag: 'wx', mode: 0o600 });
  const timer = setTimeout(() => { rm(file, { force: true }).catch(() => {}); }, 120_000);
  timer.unref();
  const query = new URLSearchParams({ func: 'setup', v: '1', vault: vault.name, path: vault.path, id });
  // Obsidian's vault routing decodes percent escapes, but does not decode form-style '+'.
  return { uri: `obsidian://ai-bridge?${query.toString().replaceAll('+', '%20')}`, async close() { clearTimeout(timer); await rm(file, { force: true }); } };
}

export async function verifyImport(vault, expected) {
  const data = await readFile(path.join(vault.path, vault.configDir, 'plugins', 'ai-bridge', 'data.json'), 'utf8').then(JSON.parse).catch(() => ({}));
  const matched = Object.entries(expected).every(([key, value]) => JSON.stringify(data[key]) === JSON.stringify(value));
  return { imported: matched, syncError: matched ? String(data.lastSyncError || '').slice(0, 200) : '', lastSyncAt: matched ? Math.max(data.lastPeriodicSyncAt || 0, data.lastBidirectionalSyncAt || 0) : 0 };
}

export async function openObsidian(vault, uri) {
  // Open the explicitly selected vault before delivering its one-use import link.
  await powershell(`$setupUri = [Console]::In.ReadToEnd(); Start-Process -FilePath $setupUri`, `obsidian://open?path=${encodeURIComponent(vault.path)}`);
  await new Promise(resolve => setTimeout(resolve, 1200));
  await powershell(`$setupUri = [Console]::In.ReadToEnd(); Start-Process -FilePath $setupUri`, uri);
}
