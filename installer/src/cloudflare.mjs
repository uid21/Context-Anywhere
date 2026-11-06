import { t, SetupError, withLanguage, currentLanguage } from './language.mjs';
import { randomBytes, createHash } from 'node:crypto';
import { createServer } from 'node:http';

// Public PKCE client used by Cloudflare's open-source Wrangler. No client secret.
// Keep the consent screen labelled Wrangler; do not touch Wrangler's auth store.
const CLIENT_ID = '54d11594-84e4-41aa-b438-e81b8fa78ee7';
const CALLBACK = 'http://localhost:8976/oauth/callback';
const SCOPES = 'account:read user:read workers:write workers_kv:write workers_scripts:write';
const AUTH = 'https://dash.cloudflare.com/oauth2';
export const API = 'https://api.cloudflare.com/client/v4';

export async function login(onToken) {
  const verifier = randomBytes(48).toString('base64url');
  const state = randomBytes(32).toString('base64url');
  let used = false;
  const language = currentLanguage();
  const server = createServer((req, res) => withLanguage(language, async () => {
    const url = new URL(req.url, CALLBACK);
    if (url.pathname !== '/oauth/callback' || url.searchParams.get('state') !== state || used) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end(t('登录回调无效。', 'Invalid login callback.')); return;
    }
    used = true;
    try {
      if (url.searchParams.has('error') || !url.searchParams.get('code')) throw new SetupError("Cloudflare 授权已取消，请重新登录。", "Cloudflare authorization was canceled. Sign in again.");
      const response = await fetch(`${AUTH}/token`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'authorization_code', client_id: CLIENT_ID,
          redirect_uri: CALLBACK, code: url.searchParams.get('code'), code_verifier: verifier }),
        signal: AbortSignal.timeout(30_000),
      });
      const data = await response.json();
      if (!response.ok || !data.access_token) throw new SetupError("Cloudflare 登录失败，请重新登录或使用 API Token。", "Cloudflare sign-in failed. Sign in again or use an API token.");
      // Deployment credentials are session-only. No refresh token is persisted.
      await onToken(data.access_token);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
        .end(t('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Context Anywhere</title><p>Cloudflare 已连接。可以关闭此页，返回部署向导。</p></html>', '<!doctype html><html lang="en"><meta charset="utf-8"><title>Context Anywhere</title><p>Cloudflare is connected. You can close this page and return to the setup wizard.</p></html>'));
    } catch (error) {
      await onToken(null, error);
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end(t("登录未完成，请返回部署向导查看原因。", "Sign-in is incomplete. Return to the setup wizard for details."));
    } finally { clearTimeout(timer); server.close(); }
  }));
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(8976, 'localhost', resolve); });
  const timer = setTimeout(() => { server.close(); onToken(null, new SetupError("Cloudflare 登录已超时，请重试。", "Cloudflare sign-in timed out. Try again.")); }, 5 * 60_000);
  timer.unref();
  const url = new URL(`${AUTH}/auth`);
  for (const [key, value] of Object.entries({ response_type: 'code', client_id: CLIENT_ID, redirect_uri: CALLBACK,
    scope: SCOPES, state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' })) {
    url.searchParams.set(key, value);
  }
  return { url: url.href, close() { clearTimeout(timer); server.close(); } };
}

export class Cloudflare {
  constructor(token, fetcher = fetch) { this.token = token; this.fetcher = fetcher; }
  async request(path, method = 'GET', body, { missing = false, raw = false, envelope = false } = {}) {
    const headers = { Authorization: `Bearer ${this.token}`, 'User-Agent': 'Context-Anywhere-Setup/1.0.0' };
    if (body && !(body instanceof FormData)) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(body); }
    const response = await this.fetcher(`${API}${path}`, { method, headers, body, signal: AbortSignal.timeout(120_000), redirect: 'error' });
    if (missing && response.status === 404) return null;
    if (raw && response.ok) {
      const value = await response.text();
      if (Buffer.byteLength(value) > 32 * 1024) throw new SetupError('恢复记录超过允许的大小。', 'The recovery record exceeds the allowed size.');
      return value;
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) {
      const errorCodes = (data.errors || []).map(e => Number(e.code)).filter(Number.isFinite);
      const codes = errorCodes.join(',');
      const describe = () => {
        const target = path.includes('/storage/kv/') ? t("OAuth KV 存储", "OAuth KV storage") : path.includes('/r2/') ? t("R2 笔记桶", "R2 notes bucket") : path.includes('/workers/scripts/') ? 'Worker' : path.includes('/workers/subdomain') ? t("workers.dev 地址", "workers.dev address") : t("账号", "Account");
        let guidance = t("请稍后重试；若仍失败，请保留此错误码。", "Try again later. If it still fails, keep this error code.");
        if (errorCodes.includes(10041)) guidance = t("Worker 绑定的 KV 存储不存在。请重新点击部署，让向导检查并重建缺失的资源。", "The KV storage bound to the Worker is missing. Click Deploy again to check and recreate missing resources.");
        else if (errorCodes.includes(10013) && path.includes('/storage/kv/')) guidance = t("指定的 KV 存储不存在，请重新部署以恢复。", "The specified KV storage is missing. Deploy again to restore it.");
        else if (errorCodes.includes(10006) && path.includes('/r2/')) guidance = t("指定的 R2 笔记桶不存在，请重新部署以恢复。", "The specified R2 notes bucket is missing. Deploy again to restore it.");
        else if (response.status === 401 || response.status === 403) guidance = t("本次授权已失效或没有这项操作的权限，请重新登录 Cloudflare 或核对 Token 权限。", "This authorization has expired or lacks permission for this operation. Sign in to Cloudflare again or check the token permissions.");
        // Never echo provider response bodies: they can contain credentials.
        return t(`${target}操作失败（HTTP ${response.status}${codes ? ` / ${codes}` : ''}）。${guidance}`, `${target} operation failed (HTTP ${response.status}${codes ? ` / ${codes}` : ''}). ${guidance}`);
      };
      const error = new SetupError(describe);
      error.status = response.status; error.codes = errorCodes;
      throw error;
    }
    return envelope ? data : data.result;
  }
  async list(path, field) {
    const all = [];
    for (let page = 1; page <= 100; page++) {
      const result = await this.request(`${path}${path.includes('?') ? '&' : '?'}page=${page}&per_page=100`);
      const items = field ? result?.[field] : result;
      if (!Array.isArray(items)) throw new SetupError("Cloudflare 返回了无法识别的资源列表。", "Cloudflare returned an unrecognized resource list.");
      all.push(...items);
      if (items.length < 100) return all;
    }
    throw new SetupError("账号资源超过查询上限，请使用更小的账号权限范围。", "The account exceeds the resource query limit. Use a more limited account permission scope.");
  }
}

export function resourceNames(label, id) {
  if (!/^[a-z][a-z0-9-]{1,30}[a-z0-9]$/.test(label)) throw new SetupError("部署名称需为 3–32 位小写字母、数字或连字符，以字母开头。", "The deployment name must contain 3–32 lowercase letters, numbers, or hyphens, and start with a letter.");
  if (!/^[a-f0-9]{8}$/.test(id)) throw new SetupError("安装标识无效。", "The setup identifier is invalid.");
  const worker = `${label}-${id}`;
  return { worker, bucket: `${worker}-notes`, kvTitle: `${worker}-oauth` };
}

export async function deploy({ cf, state, module, save, progress, fetcher = fetch, saveRecovery = async () => {} }) {
  const { accountId, names, id, secrets } = state;
  if (!/^[a-f0-9]{32}$/.test(accountId)) throw new SetupError("请选择有效的 Cloudflare 账号。", "Select a valid Cloudflare account.");
  const base = `/accounts/${accountId}`;
  progress(t("检查独立资源与 workers.dev 地址", "Checking dedicated resources and the workers.dev address"));
  let domain = await cf.request(`${base}/workers/subdomain`, 'GET', undefined, { missing: true });
  if (!domain?.subdomain) {
    const subdomain = state.workersSubdomain || `ca-notes-${id}`;
    if (!/^[a-z][a-z0-9-]{1,50}[a-z0-9]$/.test(subdomain)) throw new SetupError("workers.dev 子域名需为 3–52 位小写字母、数字和连字符。", "The workers.dev subdomain must contain 3–52 lowercase letters, numbers, or hyphens.");
    progress(t("为尚未开通 Workers 的账号注册 workers.dev 子域名", "Registering a workers.dev subdomain for this new Workers account"));
    domain = await cf.request(`${base}/workers/subdomain`, 'PUT', { subdomain });
    if (!domain?.subdomain) throw new SetupError("workers.dev 子域名注册未成功。换一个子域名后重试。", "The workers.dev subdomain could not be registered. Choose another subdomain and try again.");
  }
  const existing = await cf.request(`${base}/workers/scripts/${names.worker}/settings`, 'GET', undefined, { missing: true });
  if (existing && !existing.tags?.includes(`context-anywhere-setup:${id}`)) {
    throw new SetupError("这个 Worker 名称已被其他部署占用。向导不会覆盖它，请换一个部署名称。", "This Worker name belongs to another deployment. It will not be overwritten. Choose a different deployment name.");
  }
  // A receipt records previous success, not current cloud existence. In
  // particular, deleted KV IDs must never be reused in an upload's bindings.
  progress(t("核对已记录的 R2 和 KV 是否仍然存在", "Checking that the recorded R2 and KV resources still exist"));
  const [bucket, namespace] = await Promise.all([
    state.bucketCreated ? cf.request(`${base}/r2/buckets/${names.bucket}`, 'GET', undefined, { missing: true }) : undefined,
    state.kvId ? cf.request(`${base}/storage/kv/namespaces/${state.kvId}`, 'GET', undefined, { missing: true }) : undefined,
  ]);
  if (state.bucketCreated && bucket !== null && bucket?.name !== names.bucket) throw new SetupError("Cloudflare 返回的 R2 信息与部署记录不一致，已停止部署。", "The R2 information from Cloudflare does not match the deployment record. Deployment has stopped.");
  if (state.kvId && namespace !== null && namespace?.id !== state.kvId) throw new SetupError("Cloudflare 返回的 KV 信息与部署记录不一致，已停止部署。", "The KV information from Cloudflare does not match the deployment record. Deployment has stopped.");
  const missingResources = [];
  if (state.bucketCreated && bucket === null) { state.bucketCreated = false; missingResources.push(t("R2 笔记桶", "R2 notes bucket")); }
  if (state.kvId && namespace === null) { delete state.kvId; missingResources.push('OAuth KV'); }
  if (!existing) state.workerUploaded = false;
  state.deployed = false;
  await save();
  if (missingResources.length) progress(t(`云端缺少${missingResources.join('、')}，正在重新创建`, `Recreating missing cloud resources: ${missingResources.join(', ')}`));
  // Save each resource immediately; failures can resume without adopting existing resources.
  if (!state.bucketCreated) {
    progress(t("创建新的 R2 笔记桶", "Creating a new R2 notes bucket"));
    await cf.request(`${base}/r2/buckets`, 'POST', { name: names.bucket });
    state.bucketCreated = true; await save();
  }
  if (!state.kvId) {
    progress(t("创建新的 OAuth KV", "Creating new OAuth KV storage"));
    const namespace = await cf.request(`${base}/storage/kv/namespaces`, 'POST', { title: names.kvTitle });
    if (!namespace?.id) throw new SetupError("Cloudflare 未返回新建 KV 的标识，部署尚未完成，请重试。", "Cloudflare did not return an identifier for the new KV storage. Deployment is incomplete. Try again.");
    state.kvId = namespace.id; await save();
  }
  progress(t("部署公开版 Worker 和两把独立密钥", "Deploying the public Worker build and two separate keys"));
  const metadata = {
    main_module: 'index.js', compatibility_date: '2026-08-29',
    compatibility_flags: ['nodejs_compat', 'global_fetch_strictly_public'],
    tags: [`context-anywhere-setup:${id}`], observability: { enabled: false },
    bindings: [
      { type: 'r2_bucket', name: 'AI_MIRROR', bucket_name: names.bucket },
      { type: 'kv_namespace', name: 'OAUTH_KV', namespace_id: state.kvId },
      { type: 'secret_text', name: 'MIRROR_TOKEN', text: secrets.write },
      { type: 'secret_text', name: 'MIRROR_READ_KEY', text: secrets.read },
    ],
  };
  const form = new FormData();
  form.set('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.set('index.js', new Blob([module], { type: 'application/javascript+module' }), 'index.js');
  await cf.request(`${base}/workers/scripts/${names.worker}`, 'PUT', form);
  state.workerUploaded = true; await save();
  await cf.request(`${base}/workers/scripts/${names.worker}/subdomain`, 'POST', { enabled: true, previews_enabled: false });
  state.workerUrl = `https://${names.worker}.${domain.subdomain}.workers.dev`; await save();
  progress(t("验证线上连接和只读授权入口", "Verifying the live connection and read-only authorization endpoint"));
  let last, healthy = false;
  // New workers.dev routes need time to propagate. Bounded retries only during deployment.
  for (const delay of [0, 3000, 7000, 15000, 25000]) {
    if (delay) await new Promise(r => setTimeout(r, delay));
    try {
      const health = await fetcher(`${state.workerUrl}/health`, { headers: { Authorization: `Bearer ${secrets.write}` }, signal: AbortSignal.timeout(15_000) });
      if (!health.ok || (await health.json()).service !== 'obsidian-ai-mirror') throw new SetupError("连接尚未就绪", "The connection is not ready yet");
      const discovery = await fetcher(`${state.workerUrl}/.well-known/oauth-authorization-server`, { signal: AbortSignal.timeout(15_000) });
      if (!discovery.ok || !(await discovery.json()).authorization_endpoint) throw new SetupError("OAuth 入口尚未就绪", "The OAuth endpoint is not ready yet");
      healthy = true; break;
    } catch (error) { last = error; }
  }
  if (!healthy) throw new SetupError(() => t(`资源已创建，线上连接暂未通过。稍后点击重试即可继续。${last?.message === t("连接尚未就绪", "The connection is not ready yet") ? '' : t("请同时检查网络连接。", "Also check your network connection.")}`, `Resources have been created, but the live connection is not ready. Click Retry later to continue. ${last?.message === t("连接尚未就绪", "The connection is not ready yet") ? '' : t("请同时检查网络连接。", "Also check your network connection.")}`));
  // Mirror readiness survives a recoverable backup failure; the caller surfaces
  // a dedicated retry state without redeploying healthy resources.
  state.deployed = true; await save();
  await saveRecovery();
  await save(); progress(t('部署成功', 'Deployment complete'));
}
