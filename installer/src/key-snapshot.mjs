import { createECDH, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { readKind, uploadWorker } from './cloudflare.mjs';
import { namespace, recordFromState, verifyRecovery, verifyResources } from './recovery.mjs';
import { SetupError } from './language.mjs';

const objectKey = '__context_anywhere/read-keys-v1.json';
const hash = data => createHash('sha256').update(data).digest('hex');
const invalid = () => new SetupError('无法确认云端最新读取密码，请稍后刷新。', 'Cannot verify the latest cloud read passwords. Refresh again shortly.');
const maxBytes = 1024 * 1024;
const recipients = new WeakMap();
const scriptPath = state => `/accounts/${state.accountId}/workers/scripts/${state.names.worker}`;
export const kvPath = (state, id) => `/accounts/${state.accountId}/storage/kv/namespaces/${id}`;

async function activeVersion(cf, path) {
  const { deployments } = await cf.request(path + '/deployments');
  const latest = Array.isArray(deployments) && [...deployments].sort((a, b) => Date.parse(b.created_on) - Date.parse(a.created_on))[0];
  const versions = latest?.versions;
  if (versions?.length !== 1 || versions[0].percentage !== 100 || !/^[a-f\d-]{36}$/i.test(versions[0].version_id))
    throw new SetupError('当前 Worker 没有唯一生效版本，请先在 Cloudflare 核对部署。', 'Check the Cloudflare deployment. Setup requires one Worker version serving all traffic.');
  return versions[0].version_id;
}

function openSnapshot(ready, pair, write) {
  try {
    const encrypted = Buffer.from(ready.ciphertext, 'base64url');
    const key = pair.computeSecret(Buffer.from(ready.publicKey, 'base64url'));
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ready.iv, 'base64url'));
    decipher.setAAD(Buffer.from('context-anywhere/read-keys/v1/' + ready.nonceHash));
    decipher.setAuthTag(encrypted.subarray(-16));
    const data = JSON.parse(Buffer.concat([decipher.update(encrypted.subarray(0, -16)), decipher.final()]));
    if (data.version !== 1 || !Array.isArray(data.keys)) throw invalid();
    const secrets = { write };
    for (const { slot, value } of data.keys) {
      const kind = readKind(slot);
      if (!Number.isSafeInteger(slot) || slot < 1 || typeof value !== 'string' || !value || value === write || Object.hasOwn(secrets, kind)) throw invalid();
      secrets[kind] = value;
    }
    return secrets;
  } catch { throw invalid(); }
}

async function recipient(cf, kv, worker, publicKey) {
  const pair = createECDH('prime256v1');
  const entry = pub => 'recipient:' + worker + ':' + hash(pub);
  // KV writes can take a minute to become visible at another edge.
  let cache = recipients.get(cf);
  if (!cache) { cache = new Map(); recipients.set(cf, cache); }
  if (typeof publicKey === 'string' && /^[A-Za-z0-9_-]{87}$/.test(publicKey)) {
    const cached = cache.get(kv + '/' + entry(publicKey));
    if (cached) return cached;
    const stored = await cf.request(kv + '/values/' + encodeURIComponent(entry(publicKey)), 'GET', undefined, { raw: true, missing: true });
    if (stored) {
      try {
        pair.setPrivateKey(Buffer.from(JSON.parse(stored).privateKey, 'base64url'));
        if (pair.getPublicKey('base64url') === publicKey) { cache.set(kv + '/' + entry(publicKey), pair); return pair; }
      } catch { /* A lost recipient can be replaced through a fresh challenge. */ }
    }
  }
  pair.generateKeys();
  await cf.request(kv + '/bulk', 'PUT', [{ key: entry(pair.getPublicKey('base64url')), value: JSON.stringify({ version: 1, privateKey: pair.getPrivateKey('base64url') }) }]);
  cache.set(kv + '/' + entry(pair.getPublicKey('base64url')), pair);
  return pair;
}

async function labelsFor(cf, kv, worker) {
  const prefix = 'label:' + worker + ':', names = {}, seen = new Set(); let cursor = '';
  do {
    const query = new URLSearchParams({ prefix, limit: '1000' }); if (cursor) query.set('cursor', cursor);
    const response = await cf.request(kv + '/keys?' + query, 'GET', undefined, { envelope: true });
    if (!Array.isArray(response?.result)) throw invalid();
    for (const item of response.result) {
      if (!item.name.startsWith(prefix)) continue;
      const slot = Number(item.name.slice(prefix.length));
      if (Number.isSafeInteger(slot) && slot > 0 && typeof item.metadata?.name === 'string') names[readKind(slot)] = item.metadata.name.slice(0, 100);
    }
    cursor = response.result_info?.cursor;
    if (cursor && seen.has(cursor)) throw invalid(); seen.add(cursor);
  } while (cursor);
  return names;
}

export async function syncReadKeys({ cf, state, loadModule, fetcher = fetch, attaching = false }) {
  const record = recordFromState(state), path = scriptPath(state);
  let space = await namespace(cf, state.accountId);
  const { bindings, health } = await verifyRecovery(cf, record, space?.id, fetcher, attaching);
  space ??= await namespace(cf, state.accountId, true);
  if (space.id === state.kvId) throw invalid();
  let version = await activeVersion(cf, path);
  if (!bindings.some(b => b.type === 'version_metadata' && b.name === 'CF_VERSION_METADATA') || health.readKeySyncVersion !== 1 || attaching) {
    const settings = await cf.request(path + '/settings');
    await uploadWorker(cf, state, await loadModule(), true, settings);
    version = await activeVersion(cf, path);
    const updated = await verifyResources(cf, record, space.id);
    if (!updated.some(b => b.type === 'version_metadata' && b.name === 'CF_VERSION_METADATA')) throw invalid();
  }
  const kv = kvPath(state, space.id);
  const object = `/accounts/${state.accountId}/r2/buckets/${state.names.bucket}/objects/${objectKey}`;
  async function getObject() {
    const text = await cf.request(object, 'GET', undefined, { missing: true, raw: true, maxBytes });
    if (text === null) return null;
    try { return JSON.parse(text); } catch { return null; }
  }
  const previous = await getObject();
  const pair = await recipient(cf, kv, state.names.worker, previous?.recipientPublicKey || previous?.publicKey);
  const publicKey = pair.getPublicKey('base64url');
  const finish = async secrets => {
    const readKeyNames = await labelsFor(cf, kv, state.names.worker);
    if (await activeVersion(cf, path) !== version) return null;
    return { ...state, secrets, readKeyNames, recoveryNamespaceId: space.id };
  };
  if (previous?.state === 'ready' && previous.recipientPublicKey === publicKey && previous.workerVersionId === version) {
    let secrets;
    try { secrets = openSnapshot(previous, pair, state.secrets.write); } catch { /* Rebuild a damaged envelope from the current Worker. */ }
    if (secrets) { const result = await finish(secrets); if (result) return result; }
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    const nonce = randomBytes(32).toString('base64url'), nonceHash = hash(nonce);
    await cf.request(object, 'PUT', Buffer.from(JSON.stringify({ version: 1, state: 'challenge', publicKey, nonceHash, expiresAt: Date.now() + 120000, workerVersionId: version })));
    const response = await fetcher(state.workerUrl + '/admin/read-keys/sync', { method: 'POST', headers: { 'X-Context-Anywhere-Challenge': nonce }, redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!response.ok && ![403, 409].includes(response.status)) throw invalid();
    if (response.ok) {
      const ready = await getObject();
      if (ready?.version === 1 && ready.state === 'ready' && ready.recipientPublicKey === publicKey && ready.nonceHash === nonceHash && ready.workerVersionId === version) {
        const result = await finish(openSnapshot(ready, pair, state.secrets.write));
        if (result) return result;
      }
    }
    await delay(200 * (attempt + 1) + Math.random() * 200); version = await activeVersion(cf, path);
  }
  throw invalid();
}
