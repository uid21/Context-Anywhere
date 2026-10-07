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
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, CALLBACK);
    if (url.pathname !== '/oauth/callback' || url.searchParams.get('state') !== state || used) {
      res.writeHead(400).end('Invalid login callback'); return;
    }
    used = true;
    try {
      if (url.searchParams.has('error') || !url.searchParams.get('code')) throw new Error('Cloudflare 授权已取消，请重新登录。');
      const response = await fetch(`${AUTH}/token`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'authorization_code', client_id: CLIENT_ID,
          redirect_uri: CALLBACK, code: url.searchParams.get('code'), code_verifier: verifier }),
        signal: AbortSignal.timeout(30_000),
      });
      const data = await response.json();
      if (!response.ok || !data.access_token) throw new Error('Cloudflare 登录失败，请重新登录或使用 API Token。');
      // Deployment credentials are session-only. No refresh token is persisted.
      await onToken(data.access_token);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
        .end('<!doctype html><title>Context Anywhere</title><p>Cloudflare 已连接。可以关闭此页，返回安装向导。</p>');
    } catch (error) {
      await onToken(null, error);
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('登录未完成，请返回安装向导查看原因。');
    } finally { clearTimeout(timer); server.close(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(8976, 'localhost', resolve); });
  const timer = setTimeout(() => { server.close(); onToken(null, new Error('Cloudflare 登录已超时，请重试。')); }, 5 * 60_000);
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
  async request(path, method = 'GET', body, { missing = false } = {}) {
    const headers = { Authorization: `Bearer ${this.token}`, 'User-Agent': 'Context-Anywhere-Setup/0.1.0' };
    if (body && !(body instanceof FormData)) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(body); }
    const response = await this.fetcher(`${API}${path}`, { method, headers, body, signal: AbortSignal.timeout(120_000) });
    if (missing && response.status === 404) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) {
      const codes = (data.errors || []).map(e => e.code).join(',');
      // Never echo provider response bodies: they can contain credentials.
      throw new Error(`Cloudflare 操作失败（HTTP ${response.status}${codes ? ` / ${codes}` : ''}）。检查账号权限、R2 是否已启用，再重试。`);
    }
    return data.result;
  }
  async list(path, field) {
    const all = [];
    for (let page = 1; page <= 100; page++) {
      const result = await this.request(`${path}${path.includes('?') ? '&' : '?'}page=${page}&per_page=100`);
      const items = field ? result?.[field] : result;
      if (!Array.isArray(items)) throw new Error('Cloudflare 返回了无法识别的资源列表。');
      all.push(...items);
      if (items.length < 100) return all;
    }
    throw new Error('账号资源超过查询上限，请使用更小的账号权限范围。');
  }
}

export function resourceNames(label, id) {
  if (!/^[a-z][a-z0-9-]{1,30}[a-z0-9]$/.test(label)) throw new Error('部署名称需为 3–32 位小写字母、数字或连字符，以字母开头。');
  if (!/^[a-f0-9]{8}$/.test(id)) throw new Error('安装标识无效。');
  const worker = `${label}-${id}`;
  return { worker, bucket: `${worker}-notes`, kvTitle: `${worker}-oauth` };
}

export async function deploy({ cf, state, module, save, progress, fetcher = fetch }) {
  const { accountId, names, id, secrets } = state;
  if (!/^[a-f0-9]{32}$/.test(accountId)) throw new Error('请选择有效的 Cloudflare 账号。');
  const base = `/accounts/${accountId}`;
  progress('检查独立资源与 workers.dev 地址');
  let domain = await cf.request(`${base}/workers/subdomain`, 'GET', undefined, { missing: true });
  if (!domain?.subdomain) {
    const subdomain = state.workersSubdomain || `ca-notes-${id}`;
    if (!/^[a-z][a-z0-9-]{1,50}[a-z0-9]$/.test(subdomain)) throw new Error('workers.dev 子域名需为 3–52 位小写字母、数字和连字符。');
    progress('为尚未开通 Workers 的账号注册 workers.dev 子域名');
    domain = await cf.request(`${base}/workers/subdomain`, 'PUT', { subdomain });
    if (!domain?.subdomain) throw new Error('workers.dev 子域名注册未成功。换一个子域名后重试。');
  }
  const existing = await cf.request(`${base}/workers/scripts/${names.worker}/settings`, 'GET', undefined, { missing: true });
  if (existing && !existing.tags?.includes(`context-anywhere-setup:${id}`)) {
    throw new Error('这个 Worker 名称已被其他部署占用。安装器不会覆盖它，请换一个部署名称。');
  }
  // Save each resource immediately; failures can resume without adopting existing resources.
  if (!state.bucketCreated) {
    progress('创建新的 R2 笔记桶');
    await cf.request(`${base}/r2/buckets`, 'POST', { name: names.bucket });
    state.bucketCreated = true; await save();
  }
  if (!state.kvId) {
    progress('创建新的 OAuth KV');
    const namespace = await cf.request(`${base}/storage/kv/namespaces`, 'POST', { title: names.kvTitle });
    state.kvId = namespace.id; await save();
  }
  progress('部署公开版 Worker 和两把独立密钥');
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
  progress('验证线上连接和只读授权入口');
  let last;
  // New workers.dev routes need time to propagate. Bounded retries only during deployment.
  for (const delay of [0, 3000, 7000, 15000, 25000]) {
    if (delay) await new Promise(r => setTimeout(r, delay));
    try {
      const health = await fetcher(`${state.workerUrl}/health`, { headers: { Authorization: `Bearer ${secrets.write}` }, signal: AbortSignal.timeout(15_000) });
      if (!health.ok || (await health.json()).service !== 'obsidian-ai-mirror') throw new Error('连接尚未就绪');
      const discovery = await fetcher(`${state.workerUrl}/.well-known/oauth-authorization-server`, { signal: AbortSignal.timeout(15_000) });
      if (!discovery.ok || !(await discovery.json()).authorization_endpoint) throw new Error('OAuth 入口尚未就绪');
      state.deployed = true; await save(); progress('部署成功'); return;
    } catch (error) { last = error; }
  }
  throw new Error(`资源已创建，线上连接暂未通过。稍后点击重试即可继续。${last?.message === '连接尚未就绪' ? '' : '请同时检查网络连接。'}`);
}
