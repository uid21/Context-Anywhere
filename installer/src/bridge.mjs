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
import { discoverRecoveries, readRecovery, verifyRecovery, validateRecord, writeRecovery, recoveryProgress } from './recovery.mjs';

// Private stdin/stdout pipe owned by the native .exe. No HTTP UI server.
const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = process.env.CA_SETUP_ROOT || path.resolve(sourceDirectory, '..');
const dataDirectory = process.env.CA_SETUP_DATA_DIR || path.join(process.env.LOCALAPPDATA || os.homedir(), 'ContextAnywhereSetup');
const store = new Store(dataDirectory);
const freshState = () => ({ id: randomBytes(4).toString('hex'), secrets: { write: randomBytes(32).toString('base64url'), read: randomBytes(32).toString('base64url') } });
let state = await store.load() || freshState();
let cf, loginSession, importSession, loginError = '', authMethod = '', accounts = [], busy = false;
let recoveryAccountId = '', recoveryChecked = false, recoveryChoice = '', recoveryNamespaceId = null, recoveries = [];
let recoveryWarning = '';
let uiLanguage = currentLanguage();
const save = () => store.save(state);
const emitState = () => withLanguage(uiLanguage, () => emit({ event: 'state', state: publicState() }));
function publicState() {
  return { id: state.id, label: state.label || 'context-anywhere', names: state.names, accountId: state.accountId,
    vault: state.vault, settings: state.settings, deployed: !!state.deployed, workerUrl: state.workerUrl,
    imported: !!state.imported, workersSubdomain: state.workersSubdomain,
    recovered: !!state.recovered, recoverySaved: !!state.recoverySaved, recoveryWarning: recoveryWarning ? redact(recoveryWarning.message) : '', recoveryAccountId, recoveryChecked, recoveryChoice, recoveries,
    authenticated: !!cf, authMethod, accounts, loginError: loginError ? redact(loginError.message || loginError) : '', version: '1.0.0' };
}
function manualConfig() {
  if (!state.deployed) throw new SetupError("请先完成部署。", "Complete the deployment first.");
  const url = `${state.workerUrl}/mcp`;
  return { url, readPassword: state.secrets.read,
    text: t(`Context Anywhere\nMCP 地址：${url}\n认证：OAuth\n授权页面输入镜像读取密码（仅用于本镜像，不能上传或修改笔记）。\n此连接为只读，不需要 Write Token。`, `Context Anywhere\nMCP URL: ${url}\nAuthentication: OAuth\nEnter the mirror read password on the authorization page. It only grants access to this mirror and cannot upload or change notes.\nThis connection is read-only; no Write Token is needed.`),
    json: JSON.stringify({ mcpServers: { 'context-anywhere': { url } } }, null, 2),
    toml: `[mcp_servers.context_anywhere]\nurl = "${url}"\n` };
}
function redact(message, input = {}) {
  for (const value of [state.secrets?.write, state.secrets?.read, cf?.token, input.token]) if (value) message = message.replaceAll(value, t("[已隐藏]", "[redacted]"));
  return message.slice(0, 500);
}
async function authenticate(token, method) {
  const candidate = new Cloudflare(token);
  const found = await candidate.list('/accounts');
  if (!found.length) throw new SetupError("该授权没有可访问的 Cloudflare 账号。", "This authorization has no accessible Cloudflare accounts.");
  cf = candidate; authMethod = method; accounts = found.map(account => ({ id: account.id, name: account.name })); loginError = '';
  resetDiscovery();
}

function resetDiscovery() { recoveryAccountId = ''; recoveryChecked = false; recoveryChoice = ''; recoveryNamespaceId = null; recoveries = []; }
function requireAccount(accountId) {
  if (!cf || !accounts.some(account => account.id === accountId)) throw new SetupError('请先登录 Cloudflare 并选择本次授权中的账号。', 'Sign in to Cloudflare and select an account from this authorization.');
}
async function savePrivateRecovery(progress) {
  progress(recoveryProgress());
  try { Object.assign(state, await writeRecovery(cf, state)); await save(); recoveryWarning = ''; return true; }
  catch (error) {
    state.recoverySaved = false; await save();
    recoveryWarning = new SetupError(() => t(`镜像已就绪，恢复记录待重试。当前电脑可以继续使用；新设备恢复将在保存成功后可用。${error instanceof SetupError ? error.message : ''}`, `Your mirror is ready. Retry saving recovery. This device can keep working; new-device recovery will be available after saving succeeds. ${error instanceof SetupError ? error.message : ''}`));
    return false;
  }
}

export async function command(action, input, progress) {
  switch (action) {
    case 'state': return publicState();
    case 'manual': return manualConfig();
    case 'secret.get': {
      if (!state.deployed || !['read', 'write'].includes(input.kind)) throw new SetupError('请先完成部署或恢复。', 'Complete deployment or recovery first.');
      return { value: state.secrets[input.kind] };
    }
    case 'recovery.list': {
      requireAccount(input.accountId); resetDiscovery(); recoveryAccountId = input.accountId;
      progress(t('正在查找这个账号的部署恢复记录', 'Looking for deployment recovery records in this account'));
      const result = await discoverRecoveries(cf, input.accountId);
      recoveryNamespaceId = result.namespaceId; recoveries = result.records; recoveryChecked = true;
      recoveryChoice = recoveries.length ? '' : 'new';
      return { records: recoveries, recoveries, recoveryChecked: true };
    }
    case 'recovery.new': {
      requireAccount(input.accountId);
      if (!recoveryChecked || recoveryAccountId !== input.accountId) throw new SetupError('请先查找账号的恢复记录。', 'Check this account for recovery records first.');
      if (state.deployed || state.names) throw new SetupError('本机已有部署记录，请保留当前部署；不能在此覆盖为新部署。', 'This device already has a deployment record. Keep that deployment; it cannot be replaced here.');
      recoveryChoice = 'new'; return { selected: true };
    }
    case 'recovery.restore': {
      requireAccount(input.accountId);
      if (!recoveryChecked || recoveryAccountId !== input.accountId || !recoveries.some(item => item.key === input.key)) throw new SetupError('请刷新并选择账号中的恢复记录。', 'Refresh and select a recovery record from this account.');
      progress(t('正在核对云端资源和已有凭据', 'Checking cloud resources and existing credentials'));
      const record = await readRecovery(cf, input.accountId, recoveryNamespaceId, input.key);
      if (state.names && (state.accountId !== record.accountId || state.names.worker !== record.names.worker)) throw new SetupError('本机已有另一套部署记录，已停止恢复，未覆盖本机配置。', 'This device already has a different deployment. Recovery stopped without replacing the local record.');
      await verifyRecovery(cf, record, recoveryNamespaceId);
      const restored = { id: record.id, label: record.label, accountId: record.accountId, names: record.names, kvId: record.kvId,
        secrets: record.secrets, workerUrl: record.workerUrl, bucketCreated: true, workerUploaded: true, deployed: true, recovered: true,
        recoverySaved: true, recoveryNamespaceId, recoveryCreatedAt: record.createdAt, vault: state.vault,
        boundVault: state.boundVault || (state.imported ? state.vault : undefined), imported: false };
      // A failed restore must never replace the old DPAPI record or local state.
      await importSession?.close(); importSession = null;
      await store.save(restored); state = restored; recoveryChoice = 'restore'; recoveryWarning = '';
      return { restored: true };
    }
    case 'recovery.configure': {
      if (!state.deployed || !state.vault || !input.pluginConfirmed) throw new SetupError('请先完成部署或恢复，并检查所选知识库。', 'Complete deployment or recovery and check the selected vault first.');
      const vault = await inspectVault(state.vault.path, state.vault.configDir);
      if (!vault.enabled || !vault.localImportSupported) throw new SetupError('请更新并启用 AI Bridge，再检查知识库。', 'Update and enable AI Bridge, then check the vault.');
      const updated = { ...state, vault, boundVault: state.boundVault || (state.imported ? state.vault : undefined), settings: settingsFrom(input), imported: false };
      await importSession?.close(); importSession = null;
      await store.save(updated); state = updated; return { configured: true };
    }
    case 'recovery.backup': {
      requireAccount(state.accountId);
      if (!state.deployed) throw new SetupError('请先完成原部署。', 'Complete the original deployment first.');
      const now = new Date().toISOString();
      const record = validateRecord({ ...state, kind: 'context-anywhere-recovery', version: 1, createdAt: state.recoveryCreatedAt || now, updatedAt: now }, state.accountId);
      await verifyRecovery(cf, record, state.recoveryNamespaceId);
      const saved = await savePrivateRecovery(progress); return { saved, warning: recoveryWarning?.message || '' };
    }
    case 'vault.inspect': {
      const vault = await inspectVault(input.path, input.configDir || '.obsidian');
      const bound = state.boundVault || (state.imported ? state.vault : null);
      if (bound && (bound.path !== vault.path || bound.configDir !== vault.configDir)) throw new SetupError("当前部署记录属于另一个知识库，不能直接换库。请使用该知识库的部署记录。", "This deployment record belongs to a different vault. Use the deployment record for the selected vault.");
      if (state.vault && (state.vault.path !== vault.path || state.vault.configDir !== vault.configDir)) { await importSession?.close(); importSession = null; }
      state.vault = vault; await save(); return vault;
    }
    case 'preview': {
      if (!state.vault) throw new SetupError("请先选择知识库。", "Select a vault first.");
      return previewVault(state.vault, settingsFrom(input));
    }
    case 'cloudflare.login': {
      loginSession?.close(); loginError = ''; cf = null; accounts = []; authMethod = ''; resetDiscovery();
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
      if (state.recovered) throw new SetupError('恢复流程只连接已有部署。请直接配置同步范围并导入，不会重部署或轮换密钥。', 'Recovery connects the existing deployment. Configure sync and import; setup will not redeploy or rotate credentials.');
      if (!input.cfAccountConfirmed || !input.pluginConfirmed) throw new SetupError("请先在第一步确认 Cloudflare 账号和 AI Bridge 已准备好。", "Confirm in step 1 that your Cloudflare account and AI Bridge are ready.");
      if (!cf || !state.vault) throw new SetupError("请先连接 Cloudflare 并选择知识库。", "Connect to Cloudflare and select a vault first.");
      const settings = settingsFrom(input);
      if (!accounts.some(account => account.id === input.accountId)) throw new SetupError("请选择本次授权中的 Cloudflare 账号。", "Select a Cloudflare account available through this authorization.");
      if (!state.names && (!recoveryChecked || recoveryAccountId !== input.accountId || recoveryChoice !== 'new')) throw new SetupError('请先检查账号的恢复记录，再选择恢复或创建新部署。', 'Check the account for recovery records, then choose recovery or a new deployment.');
      if (state.names && (state.label !== input.label || state.accountId !== input.accountId)) throw new SetupError("部分资源已创建，请保留当前名称和账号继续。", "Some resources have already been created. Keep the current name and account to continue.");
      if (!state.vault.enabled) throw new SetupError("请先在选中的 Obsidian 库启用 AI Bridge，再重新检查知识库。", "Enable AI Bridge in the selected Obsidian vault, then check the vault again.");
      state.label = input.label; state.accountId = input.accountId; state.workersSubdomain = String(input.workersSubdomain || '').trim();
      state.names = resourceNames(input.label, state.id); state.settings = settings; await save();
      const module = await readFile(path.join(root, 'payload', 'index.js'));
      state.recoverySaved = false;
      await deploy({ cf, state, module, save, progress, saveRecovery: () => savePrivateRecovery(progress) });
      return { deployed: true, recoverySaved: !!state.recoverySaved, warning: recoveryWarning?.message || '' };
    }
    case 'obsidian.import': {
      if (!state.deployed) throw new SetupError("请先完成部署。", "Complete the deployment first.");
      if (!state.vault || !state.settings) throw new SetupError('请先选择知识库和这台设备的同步范围。', 'Select a vault and this device\'s sync scope first.');
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
      const result = await verifyImport(state.vault, expected); state.imported = result.imported;
      if (result.imported) state.boundVault = state.vault;
      await save(); return { ...result, syncError: redact(result.syncError) };
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
    } catch (error) { emit({ id: request?.id, error: redact(String(error.message || error), request?.input), state: publicState() }); }
    finally { busy = false; }
  });
}
loginSession?.close();
await importSession?.close();
