import { SetupError, t } from './language.mjs';
import { createHash } from 'node:crypto';
import { readSlot, resourceNames } from './cloudflare.mjs';
import { verifyMirror } from './browser.mjs';

// Account-private management data. Never bind this namespace to the note Worker.
// KV provides Cloudflare-managed encryption at rest; authorized KV administrators
// can read this recovery copy. This is deliberately not a Worker secret read API.
export const RECOVERY_TITLE = 'context-anywhere-recovery-v1';
const KIND = 'context-anywhere-recovery';
const hexId = value => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);
const fail = () => new SetupError('恢复记录无效或与所选账号不匹配，未修改本机连接。', 'The recovery record is invalid or does not match the selected account. The local connection was not changed.');
const keyFor = record => `deployment:${record.names.worker}`;
const scriptName = name => typeof name === 'string' && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(name);

export function validateRecord(record, accountId) {
  if (!record || record.kind !== KIND || ![1,2].includes(record.version) || !hexId(accountId) || record.accountId !== accountId) throw fail();
  let names;
  if (record.manual === true) {
    const { worker, bucket } = record.names || {};
    if (!scriptName(worker) || !scriptName(bucket) || record.label !== worker || record.id !== manualId(accountId, worker)) throw fail();
    names = { worker, bucket };
  } else try { names = resourceNames(record.label, record.id); } catch { throw fail(); }
  if (Object.keys(names).some(key => record.names?.[key] !== names[key]) || !hexId(record.kvId)) throw fail();
  let url;
  try { url = new URL(record.workerUrl); } catch { throw fail(); }
  const workerPrefix = names.worker + '.';
  if (url.origin !== record.workerUrl || url.protocol !== 'https:' || url.port || url.username || url.password
    || !url.hostname.startsWith(workerPrefix) || !/^[a-z0-9-]+\.workers\.dev$/.test(url.hostname.slice(workerPrefix.length))) throw fail();
  // The live Worker owns all reader values, including manually set short or
  // non-ASCII passwords. Never import stale read fields from a v1 KV receipt.
  if (typeof record.secrets?.write !== 'string' || !/^[\x21-\x7e]+$/.test(record.secrets.write)
    || !Number.isFinite(Date.parse(record.createdAt)) || !Number.isFinite(Date.parse(record.updatedAt))) throw fail();
  // Whitelist data; never restore local paths, auth tokens, imported flags or settings.
  return { kind: KIND, version: record.version, ...(record.manual ? {manual:true} : {}), accountId, id: record.id, label: record.label, names, kvId: record.kvId,
    workerUrl: record.workerUrl, secrets:{write:record.secrets.write}, createdAt: record.createdAt, updatedAt: record.updatedAt };
}

export function recordFromState(state) {
  const now = new Date().toISOString();
  return validateRecord({ ...state, kind: KIND, version: 2, secrets: {write:state.secrets.write}, createdAt: state.recoveryCreatedAt || now, updatedAt: now }, state.accountId);
}

export async function namespace(cf, accountId, create = false) {
  if (!hexId(accountId)) throw fail();
  const base = `/accounts/${accountId}/storage/kv/namespaces`;
  const found = (await cf.list(base)).filter(item => item.title === RECOVERY_TITLE);
  if (found.length > 1) throw new SetupError('账号内存在重名恢复空间，请先在 Cloudflare 核对，向导不会猜测或覆盖。', 'The account contains duplicate recovery namespaces. Review them in Cloudflare; setup will not guess or overwrite them.');
  const result = found[0] || (create ? await cf.request(base, 'POST', { title: RECOVERY_TITLE }) : null);
  if (result && !hexId(result.id)) throw fail();
  return result;
}

export async function discoverRecoveries(cf, accountId) {
  const space = await namespace(cf, accountId);
  if (!space) return { namespaceId: null, records: [] };
  const records = [], cursors = new Set(); let cursor = '';
  for (let page = 0; page < 100; page++) {
    const query = new URLSearchParams({ prefix: 'deployment:', limit: '100' });
    if (cursor) query.set('cursor', cursor);
    const data = await cf.request(`/accounts/${accountId}/storage/kv/namespaces/${space.id}/keys?${query}`, 'GET', undefined, { envelope: true });
    if (!Array.isArray(data?.result)) throw fail();
    for (const item of data.result) {
      if (!item.name.startsWith('deployment:') || !scriptName(item.name.slice(11))) continue;
      // KV metadata is untrusted: display only whitelisted fields, never fetch secrets during discovery.
      const label = item.name.slice('deployment:'.length);
      const metadata = item.metadata;
      records.push({ key: item.name, label, workerUrl: '', updatedAt: metadata?.kind === KIND && Number.isFinite(Date.parse(metadata.updatedAt)) ? metadata.updatedAt : '' });
    }
    cursor = data.result_info?.cursor || '';
    if (!cursor) return { namespaceId: space.id, records };
    if (cursors.has(cursor)) throw fail();
    cursors.add(cursor);
  }
  throw new SetupError('恢复记录超过查询上限，请在 Cloudflare 核对。', 'Recovery records exceed the query limit. Review them in Cloudflare.');
}

export async function writeRecovery(cf, state, fetcher = fetch) {
  const record = recordFromState(state);
  const space = await namespace(cf, state.accountId, true);
  if (space.id === state.kvId) throw fail();
  // Resolve the actual namespace before checking bindings. Legacy local receipts
  // do not know its ID, and an existing same-name namespace may have been bound.
  const worker = await cf.request(`/accounts/${state.accountId}/workers/scripts/${state.names.worker}/settings`);
  if (!Array.isArray(worker?.bindings) || worker.bindings.some(binding => binding.type === 'kv_namespace' && binding.namespace_id === space.id)) {
    throw new SetupError('恢复空间已绑定到镜像服务，或无法确认隔离状态。未保存凭据，请在 Cloudflare 检查。', 'The recovery namespace is bound to the mirror, or isolation could not be verified. Credentials were not saved. Check Cloudflare.');
  }
  await verifyRecovery(cf, record, space.id, fetcher);
  // Persist only after a successful account-authenticated KV write. KV may take time
  // to propagate; a fresh device can refresh discovery without changing credentials.
  await cf.request(`/accounts/${state.accountId}/storage/kv/namespaces/${space.id}/bulk`, 'PUT', [{ key: keyFor(record), value: JSON.stringify(record),
    metadata: { kind: KIND, version: 2, updatedAt: record.updatedAt } }]);
  return { recoveryIndexVersion:2, recoveryNamespaceId: space.id, recoveryCreatedAt: record.createdAt, recoverySaved: true };
}

export async function readRecovery(cf, accountId, namespaceId, key) {
  if (!hexId(accountId) || !hexId(namespaceId) || !key?.startsWith('deployment:') || !scriptName(key.slice(11))) throw fail();
  const value = await cf.request(`/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key)}`, 'GET', undefined, { raw: true, missing: true });
  if (value === null) throw new SetupError('恢复记录尚未同步或已移除。请稍后刷新；不会重新生成密钥。', 'The recovery record has not propagated or was removed. Refresh later; credentials will not be regenerated.');
  let record;
  try { record = validateRecord(JSON.parse(value), accountId); } catch { throw fail(); }
  if (keyFor(record) !== key || record.kvId === namespaceId) throw fail();
  return record;
}

export async function verifyResources(cf, record, namespaceId, attaching = false) {
  record = validateRecord(record, record.accountId);
  const base = `/accounts/${record.accountId}`;
  const [settings, bucket, oauth, domain] = await Promise.all([
    cf.request(`${base}/workers/scripts/${record.names.worker}/settings`),
    cf.request(`${base}/r2/buckets/${record.names.bucket}`),
    cf.request(`${base}/storage/kv/namespaces/${record.kvId}`),
    cf.request(`${base}/workers/subdomain`),
  ]);
  const bindings = settings?.bindings || [];
  if (!(attaching && record.manual) && !settings?.tags?.includes(`context-anywhere-setup:${record.id}`) || bucket?.name !== record.names.bucket || oauth?.id !== record.kvId
    || record.workerUrl !== `https://${record.names.worker}.${domain?.subdomain}.workers.dev`
    || !bindings.some(b => b.type === 'r2_bucket' && b.name === 'AI_MIRROR' && b.bucket_name === record.names.bucket)
    || !bindings.some(b => b.type === 'kv_namespace' && b.name === 'OAUTH_KV' && b.namespace_id === record.kvId)
    || bindings.some(b => b.type === 'kv_namespace' && b.namespace_id === namespaceId)) {
    throw new SetupError('云端资源与恢复记录不一致，请在原设备检查；尚未恢复，也不会重部署。', 'Cloud resources differ from the recovery record. Check the original device; nothing was restored or redeployed.');
  }
  return bindings;
}

const manualId = (account, worker) => createHash('sha256').update(account + '/' + worker).digest('hex').slice(0,8);
export async function manualRecord(cf, accountId, worker, write) {
  if (!hexId(accountId) || !scriptName(worker)) throw fail();
  const base = '/accounts/' + accountId;
  const [settings,domain] = await Promise.all([cf.request(`${base}/workers/scripts/${worker}/settings`),cf.request(base+'/workers/subdomain')]);
  const bucket = settings?.bindings?.find(b => b.name === 'AI_MIRROR' && b.type === 'r2_bucket')?.bucket_name;
  const kvId = settings?.bindings?.find(b => b.name === 'OAUTH_KV' && b.type === 'kv_namespace')?.namespace_id;
  if (settings?.tags?.some(tag => tag.startsWith('context-anywhere-setup:') && tag !== 'context-anywhere-setup:'+manualId(accountId,worker))) throw fail();
  return recordFromState({ manual:true, id:manualId(accountId,worker), label:worker, names:{worker,bucket}, accountId, kvId,
    workerUrl:`https://${worker}.${domain?.subdomain}.workers.dev`, secrets:{write} });
}

// Call only after verifying the target URL and resource identity via the control plane.
export async function checkCredential(record, kind, fetcher = fetch) {
  const request = (route, options = {}) => fetcher(record.workerUrl + route, { ...options,
    headers: { Authorization: `Bearer ${record.secrets[kind]}`, ...options.headers }, redirect: 'error', signal: AbortSignal.timeout(15000) });
  const health = await request('/health');
  if (health.status === 401) return null;
  if (!health.ok) throw new Error('Mirror unavailable');
  const info = await health.json();
  if (info.service !== 'obsidian-ai-mirror') throw new Error('Unexpected service');
  if (kind !== 'write' && (info.readKeySlot ?? 1) !== readSlot(kind)) return null;
  const probe = await request('/note', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  if (kind === 'write' ? probe.status !== 400 || (await probe.json()).error !== 'invalid note' : probe.status !== 403) return null;
  return info;
}

export async function verifyRecovery(cf, record, namespaceId, fetcher = fetch, attaching = false) {
  const bindings = await verifyResources(cf, record, namespaceId, attaching);
  try {
    const health = await checkCredential(record, 'write', fetcher);
    if (!health) throw new Error('Credential mismatch');
    await verifyMirror(record.workerUrl, fetcher);
    return {bindings,health};
  } catch {
    throw new SetupError('恢复记录中的凭据已失效，或镜像无法连接。请在原设备检查后更新恢复记录；不会轮换密钥。', 'Saved credentials are stale or the mirror is unreachable. Check the original device and update recovery; setup will not rotate credentials.');
  }
}

export const recoveryProgress = () => t('正在保存账号内的私有恢复记录', 'Saving the private recovery record in your account');
