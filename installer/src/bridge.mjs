import { t, SetupError, withLanguage, currentLanguage } from './language.mjs';
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
let uiLanguage = currentLanguage();
const save = () => store.save(state);
const emitState = () => withLanguage(uiLanguage, () => emit({ event: 'state', state: publicState() }));
function publicState() {
  return { id: state.id, label: state.label || 'context-anywhere', names: state.names, accountId: state.accountId,
    vault: state.vault, settings: state.settings, deployed: !!state.deployed, workerUrl: state.workerUrl,
    imported: !!state.imported, workersSubdomain: state.workersSubdomain,
    authenticated: !!cf, authMethod, accounts, loginError: loginError ? redact(loginError.message || loginError) : '', version: '0.3.0' };
}
function manualConfig() {
  if (!state.deployed) throw new SetupError("请先完成部署。", "Complete the deployment first.");
  const url = `${state.workerUrl}/mcp`;
  return { url, readPassword: state.secrets.read,
    text: t(`Context Anywhere\nMCP 地址：${url}\n认证：OAuth\n授权页面输入镜像读取密码（仅用于本镜像，不能上传或修改笔记）。\n此连接为只读，不需要 Write Token。`, `Context Anywhere\nMCP URL: ${url}\nAuthentication: OAuth\nEnter the mirror read password on the authorization page. It only grants access to this mirror and cannot upload or change notes.\nThis connection is read-only; no Write Token is needed.`),
    json: JSON.stringify({ mcpServers: { 'context-anywhere': { url } } }, null, 2),
    toml: `[mcp_servers.context_anywhere]\nurl = "${url}"\n` };
}
function redact(message) {
  for (const value of [state.secrets.write, state.secrets.read, cf?.token]) if (value) message = message.replaceAll(value, t("[已隐藏]", "[redacted]"));
  return message.slice(0, 500);
}
async function authenticate(token, method) {
  const candidate = new Cloudflare(token);
  const found = await candidate.list('/accounts');
  if (!found.length) throw new SetupError("该授权没有可访问的 Cloudflare 账号。", "This authorization has no accessible Cloudflare accounts.");
  cf = candidate; authMethod = method; accounts = found.map(account => ({ id: account.id, name: account.name })); loginError = '';
}

export async function command(action, input, progress) {
  switch (action) {
    case 'state': return publicState();
    case 'manual': return manualConfig();
    case 'vault.inspect': {
      const vault = await inspectVault(input.path, input.configDir || '.obsidian');
      if (state.vault && state.imported && state.vault.path !== vault.path) throw new SetupError("当前部署记录属于另一个知识库，不能直接换库。请使用该知识库的部署记录。", "This deployment record belongs to a different vault. Use the deployment record for the selected vault.");
      state.vault = vault; await save(); return vault;
    }
    case 'preview': {
      if (!state.vault) throw new SetupError("请先选择知识库。", "Select a vault first.");
      return previewVault(state.vault, settingsFrom(input));
    }
    case 'cloudflare.login': {
      loginSession?.close(); loginError = ''; cf = null; accounts = []; authMethod = '';
      loginSession = await login(async (token, error) => {
        if (error) { loginError = error; emitState(); return; }
        try { await authenticate(token, 'oauth'); }
        catch (failure) { loginError = failure; throw failure; }
        finally { emitState(); }
      });
      await openBrowser(loginSession.url); return { opened: true };
    }
    case 'cloudflare.token': {
      if (cf) return { authenticated: true };
      const token = String(input.token || '').trim();
      if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) throw new SetupError("请粘贴完整的 Cloudflare API Token，或点击上方按钮通过浏览器登录。", "Paste the complete Cloudflare API token, or use the button above to sign in through your browser.");
      progress(t("验证 Cloudflare 授权", "Verifying Cloudflare authorization")); await authenticate(token, 'token'); return { authenticated: true };
    }
    case 'deploy': {
      if (!input.cfAccountConfirmed || !input.pluginConfirmed) throw new SetupError("请先在第一步确认 Cloudflare 账号和 AI Bridge 已准备好。", "Confirm in step 1 that your Cloudflare account and AI Bridge are ready.");
      if (!cf || !state.vault) throw new SetupError("请先连接 Cloudflare 并选择知识库。", "Connect to Cloudflare and select a vault first.");
      const settings = settingsFrom(input);
      if (!accounts.some(account => account.id === input.accountId)) throw new SetupError("请选择本次授权中的 Cloudflare 账号。", "Select a Cloudflare account available through this authorization.");
      if (state.names && (state.label !== input.label || state.accountId !== input.accountId)) throw new SetupError("部分资源已创建，请保留当前名称和账号继续。", "Some resources have already been created. Keep the current name and account to continue.");
      if (!state.vault.enabled) throw new SetupError("请先在选中的 Obsidian 库启用 AI Bridge，再重新检查知识库。", "Enable AI Bridge in the selected Obsidian vault, then check the vault again.");
      state.label = input.label; state.accountId = input.accountId; state.workersSubdomain = String(input.workersSubdomain || '').trim();
      state.names = resourceNames(input.label, state.id); state.settings = settings; await save();
      const module = await readFile(path.join(root, 'payload', 'index.js'));
      await deploy({ cf, state, module, save, progress }); return { deployed: true };
    }
    case 'obsidian.import': {
      if (!state.deployed) throw new SetupError("请先完成部署。", "Complete the deployment first.");
      const options = { ...state.settings, workerUrl: state.workerUrl, token: state.secrets.write, installerSetup: true };
      await importSession?.close();
      state.vault = await inspectVault(state.vault.path, state.vault.configDir);
      importSession = await prepareImport(state.vault, options);
      progress(t("把设置导入选中的知识库", "Importing settings into the selected vault"));
      try { await openObsidian(state.vault, importSession.uri); }
      catch (error) { await importSession.close(); throw error; }
      return { opened: true, pluginVersion: state.vault.version };
    }
    case 'obsidian.verify': {
      if (!state.vault || !state.settings) throw new SetupError("请先完成部署和设置导入。", "Complete deployment and import the settings first.");
      const expected = { ...state.settings, workerUrl: state.workerUrl, token: state.secrets.write };
      const result = await verifyImport(state.vault, expected); state.imported = result.imported; await save(); return result;
    }
    case 'chatgpt.open': {
      if (!state.deployed) throw new SetupError("请先部署镜像。", "Deploy the mirror first.");
      await verifyMirror(state.workerUrl);
      await openBrowser('https://chatgpt.com/plugins'); return { opened: true };
    }
    case 'export': {
      if (!input.path || !path.isAbsolute(input.path)) throw new SetupError("请选择保存文件的位置。", "Choose where to save the file.");
      const manual = manualConfig();
      // Deliberately excludes all secrets. The read password is copied separately.
      await writeFile(input.path, `${manual.text}\n\n${manual.json}\n\n${manual.toml}`, { flag: 'wx' }); return { saved: true };
    }
    case 'close': loginSession?.close(); await importSession?.close(); setTimeout(() => process.exit(0), 100).unref(); return { closed: true };
    default: throw new SetupError("未知操作。", "Unknown operation.");
  }
}

function emit(value) { process.stdout.write(`${JSON.stringify(value)}\n`); }
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of lines) {
  let request;
  if (line.length <= 64 * 1024) { try { request = JSON.parse(line); } catch {} }
  if (request?.language) uiLanguage = request.language;
  await withLanguage(uiLanguage, async () => {
    try {
      if (line.length > 64 * 1024) throw new SetupError("请求过大。", "The request is too large.");
      request = JSON.parse(line);
      if (busy) throw new SetupError("操作正在进行，请等待完成。", "An operation is in progress. Wait for it to finish.");
      busy = true;
      const result = await command(request.action, request.input || {}, message => emit({ id: request.id, progress: message }));
      emit({ id: request.id, result, state: publicState() });
    } catch (error) { emit({ id: request?.id, error: redact(String(error.message || error)), state: publicState() }); }
    finally { busy = false; }
  });
}
loginSession?.close();
await importSession?.close();
