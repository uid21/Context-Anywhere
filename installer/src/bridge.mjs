import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { randomBytes } from 'node:crypto';
import { Store } from './storage.mjs';
import { Cloudflare, login, resourceNames, deploy } from './cloudflare.mjs';
import { inspectVault, previewVault, settingsFrom, prepareImport, verifyImport, openObsidian } from './obsidian.mjs';
import { openBrowser, verifyMirror } from './browser.mjs';

// Private stdin/stdout pipe owned by the native .exe. No HTTP UI server.
const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = process.env.CA_SETUP_ROOT || path.resolve(sourceDirectory, '..');
const dataDirectory = process.env.CA_SETUP_DATA_DIR || path.join(process.env.LOCALAPPDATA || os.homedir(), 'ContextAnywhereSetup');
const store = new Store(dataDirectory);
let state = await store.load() || { id: randomBytes(4).toString('hex'), secrets: { write: randomBytes(32).toString('base64url'), read: randomBytes(32).toString('base64url') } };
let cf, loginSession, importSession, loginError = '', authMethod = '', accounts = [], busy = false;
const save = () => store.save(state);
function publicState() {
  return { id: state.id, label: state.label || 'context-anywhere', names: state.names, accountId: state.accountId,
    vault: state.vault, settings: state.settings, deployed: !!state.deployed, workerUrl: state.workerUrl,
    imported: !!state.imported, workersSubdomain: state.workersSubdomain,
    authenticated: !!cf, authMethod, accounts, loginError, version: '0.2.3' };
}
function manualConfig() {
  if (!state.deployed) throw new Error('请先完成部署。');
  const url = `${state.workerUrl}/mcp`;
  return { url, readPassword: state.secrets.read,
    text: `Context Anywhere\nMCP 地址：${url}\n认证：OAuth\n授权页面输入镜像读取密码（仅用于本镜像，不能上传或修改笔记）。\n此连接为只读，不需要 Write Token。`,
    json: JSON.stringify({ mcpServers: { 'context-anywhere': { url } } }, null, 2),
    toml: `[mcp_servers.context_anywhere]\nurl = "${url}"\n` };
}
function redact(message) {
  for (const value of [state.secrets.write, state.secrets.read, cf?.token]) if (value) message = message.replaceAll(value, '[已隐藏]');
  return message.slice(0, 500);
}
async function authenticate(token, method) {
  const candidate = new Cloudflare(token);
  const found = await candidate.list('/accounts');
  if (!found.length) throw new Error('该授权没有可访问的 Cloudflare 账号。');
  cf = candidate; authMethod = method; accounts = found.map(account => ({ id: account.id, name: account.name })); loginError = '';
}

export async function command(action, input, progress) {
  switch (action) {
    case 'state': return publicState();
    case 'manual': return manualConfig();
    case 'vault.inspect': {
      const vault = await inspectVault(input.path, input.configDir || '.obsidian');
      if (state.vault && state.imported && state.vault.path !== vault.path) throw new Error('当前部署记录属于另一个知识库，不能直接换库。请使用该知识库的部署记录。');
      state.vault = vault; await save(); return vault;
    }
    case 'preview': {
      if (!state.vault) throw new Error('请先选择知识库。');
      return previewVault(state.vault, settingsFrom(input));
    }
    case 'cloudflare.login': {
      loginSession?.close(); loginError = ''; cf = null; accounts = []; authMethod = '';
      loginSession = await login(async (token, error) => {
        if (error) { loginError = redact(error.message); emit({ event: 'state', state: publicState() }); return; }
        try { await authenticate(token, 'oauth'); }
        catch (failure) { loginError = redact(failure.message); throw failure; }
        finally { emit({ event: 'state', state: publicState() }); }
      });
      await openBrowser(loginSession.url); return { opened: true };
    }
    case 'cloudflare.token': {
      if (cf) return { authenticated: true };
      const token = String(input.token || '').trim();
      if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) throw new Error('请粘贴完整的 Cloudflare API Token，或点击上方按钮通过浏览器登录。');
      progress('验证 Cloudflare 授权'); await authenticate(token, 'token'); return { authenticated: true };
    }
    case 'deploy': {
      if (!input.cfAccountConfirmed || !input.pluginConfirmed) throw new Error('请先在第一步确认 Cloudflare 账号和 AI Bridge 已准备好。');
      if (!cf || !state.vault) throw new Error('请先连接 Cloudflare 并选择知识库。');
      const settings = settingsFrom(input);
      if (!accounts.some(account => account.id === input.accountId)) throw new Error('请选择本次授权中的 Cloudflare 账号。');
      if (state.names && (state.label !== input.label || state.accountId !== input.accountId)) throw new Error('部分资源已创建，请保留当前名称和账号继续。');
      if (!state.vault.enabled) throw new Error('请先在选中的 Obsidian 库启用 AI Bridge，再重新检查知识库。');
      state.label = input.label; state.accountId = input.accountId; state.workersSubdomain = String(input.workersSubdomain || '').trim();
      state.names = resourceNames(input.label, state.id); state.settings = settings; await save();
      const module = await readFile(path.join(root, 'payload', 'index.js'));
      await deploy({ cf, state, module, save, progress }); return { deployed: true };
    }
    case 'obsidian.import': {
      if (!state.deployed) throw new Error('请先完成部署。');
      const options = { ...state.settings, workerUrl: state.workerUrl, token: state.secrets.write, installerSetup: true };
      await importSession?.close();
      state.vault = await inspectVault(state.vault.path, state.vault.configDir);
      importSession = await prepareImport(state.vault, options);
      progress('把设置导入选中的知识库');
      try { await openObsidian(state.vault, importSession.uri); }
      catch (error) { await importSession.close(); throw error; }
      return { opened: true, pluginVersion: state.vault.version };
    }
    case 'obsidian.verify': {
      if (!state.vault || !state.settings) throw new Error('请先完成部署和设置导入。');
      const expected = { ...state.settings, workerUrl: state.workerUrl, token: state.secrets.write };
      const result = await verifyImport(state.vault, expected); state.imported = result.imported; await save(); return result;
    }
    case 'chatgpt.open': {
      if (!state.deployed) throw new Error('请先部署镜像。');
      await verifyMirror(state.workerUrl);
      await openBrowser('https://chatgpt.com/plugins'); return { opened: true };
    }
    case 'export': {
      if (!input.path || !path.isAbsolute(input.path)) throw new Error('请选择保存文件的位置。');
      const manual = manualConfig();
      // Deliberately excludes all secrets. The read password is copied separately.
      await writeFile(input.path, `${manual.text}\n\n${manual.json}\n\n${manual.toml}`, { flag: 'wx' }); return { saved: true };
    }
    case 'close': loginSession?.close(); await importSession?.close(); setTimeout(() => process.exit(0), 100).unref(); return { closed: true };
    default: throw new Error('未知操作。');
  }
}

function emit(value) { process.stdout.write(`${JSON.stringify(value)}\n`); }
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of lines) {
  let request;
  try {
    if (line.length > 64 * 1024) throw new Error('请求过大。');
    request = JSON.parse(line);
    if (busy) throw new Error('操作正在进行，请等待完成。');
    busy = true;
    const result = await command(request.action, request.input || {}, message => emit({ id: request.id, progress: message }));
    emit({ id: request.id, result, state: publicState() });
  } catch (error) { emit({ id: request?.id, error: redact(String(error.message || error)), state: publicState() }); }
  finally { busy = false; }
}
loginSession?.close();
await importSession?.close();
