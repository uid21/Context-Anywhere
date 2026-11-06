import test from 'node:test';
import assert from 'node:assert/strict';
import { Cloudflare, deploy, resourceNames } from '../src/cloudflare.mjs';
import { RECOVERY_TITLE, discoverRecoveries, writeRecovery, readRecovery, verifyRecovery, validateRecord } from '../src/recovery.mjs';

const account = 'a'.repeat(32), recoveryId = 'c'.repeat(32), oauthId = 'b'.repeat(32);
function fixture() {
  return { kind: 'context-anywhere-recovery', version: 1, id: 'ab12cd34', label: 'my-context', accountId: account,
    names: resourceNames('my-context', 'ab12cd34'), kvId: oauthId, workerUrl: 'https://my-context-ab12cd34.fixture.workers.dev',
    secrets: { write: 'synthetic-upload-credential', read: 'synthetic-reading-password' },
    createdAt: '2026-11-05T00:00:00.000Z', updatedAt: '2026-11-05T00:00:00.000Z' };
}
function controlPlane(record = fixture()) {
  const values = new Map(), calls = [], spaces = [], bindings = [
    { type: 'r2_bucket', name: 'AI_MIRROR', bucket_name: record.names.bucket },
    { type: 'kv_namespace', name: 'OAUTH_KV', namespace_id: record.kvId },
  ];
  const cf = new Cloudflare('synthetic-management-token', async (url, options) => {
    assert.equal(options.redirect, 'error');
    const path = new URL(url).pathname, query = new URL(url).searchParams;
    calls.push({ path, method: options.method, body: options.body });
    let result;
    if (path.endsWith('/storage/kv/namespaces')) {
      if (options.method === 'POST') { result = { id: recoveryId, title: JSON.parse(options.body).title }; spaces.push(result); }
      else result = spaces;
    } else if (path.endsWith('/bulk')) { for (const item of JSON.parse(options.body)) values.set(item.key, item); result = {}; }
    else if (path.endsWith('/keys')) {
      result = [...values.values()].filter(v => v.key.startsWith(query.get('prefix'))).map(v => ({ name: v.key, metadata: v.metadata }));
      return Response.json({ success: true, result, result_info: { cursor: '' } });
    } else if (path.includes('/values/')) {
      const item = values.get(decodeURIComponent(path.split('/values/')[1]));
      return item ? new Response(item.value) : new Response('{}', { status: 404 });
    } else if (path.endsWith('/settings')) result = { tags: ['context-anywhere-setup:' + record.id], bindings };
    else if (path.includes('/r2/buckets/')) result = { name: record.names.bucket };
    else if (path.endsWith('/' + oauthId)) result = { id: oauthId };
    else if (path.endsWith('/workers/subdomain')) result = { subdomain: 'fixture' };
    else throw new Error('Unexpected fixture endpoint');
    return Response.json({ success: true, result });
  });
  return { cf, values, calls, spaces, bindings };
}
function mirror(record, calls = []) {
  return async (url, options) => {
    assert.equal(new URL(url).origin, record.workerUrl); assert.equal(options.redirect, 'error');
    calls.push({ url, options });
    if (url.endsWith('/.well-known/oauth-authorization-server')) return Response.json({ authorization_endpoint: record.workerUrl + '/authorize', token_endpoint: record.workerUrl + '/token' });
    const token = options.headers.Authorization;
    if (!Object.values(record.secrets).some(secret => token === 'Bearer ' + secret)) return Response.json({}, { status: 401 });
    if (url.endsWith('/health')) return Response.json({ service: 'obsidian-ai-mirror' });
    assert.equal(options.body, '{}');
    return token === 'Bearer ' + record.secrets.write ? Response.json({ error: 'invalid note' }, { status: 400 }) : Response.json({ error: 'forbidden' }, { status: 403 });
  };
}

test('first deployment recovery is stored in a separate private namespace and discovery never reads credentials', async () => {
  const record = fixture(), f = controlPlane(record);
  assert.deepEqual(await discoverRecoveries(f.cf, account), { namespaceId: null, records: [] });
  assert.equal(f.calls.some(c => c.method !== 'GET'), false);
  const receipt = await writeRecovery(f.cf, { ...record, vault: { path: 'private-local-path' }, settings: { includePrefixes: ['Private'] }, imported: true });
  assert.equal(receipt.recoverySaved, true); assert.equal(receipt.recoveryNamespaceId, recoveryId);
  assert.equal(f.spaces[0].title, RECOVERY_TITLE);
  const saved = [...f.values.values()][0];
  assert.equal(saved.value.includes('private-local-path'), false); assert.equal(saved.value.includes('includePrefixes'), false);
  assert.equal(JSON.stringify(saved.metadata).includes(record.secrets.write), false);
  const before = f.calls.length;
  const discovery = await discoverRecoveries(f.cf, account);
  assert.equal(discovery.records.length, 1); assert.equal(JSON.stringify(discovery).includes(record.secrets.write), false);
  assert.equal(f.calls.slice(before).some(c => c.path.includes('/values/')), false);
  assert.deepEqual((await readRecovery(f.cf, account, recoveryId, discovery.records[0].key)).secrets, record.secrets);
});

test('recovery verifies management identity before sending either credential, leaves notes and cloud resources unchanged', async () => {
  const record = fixture(), f = controlPlane(record), calls = [];
  await verifyRecovery(f.cf, record, recoveryId, mirror(record, calls));
  assert.equal(f.calls.every(c => c.method === 'GET'), true);
  assert.equal(calls.filter(c => c.options.method === 'PUT').length, 2);
  assert.equal(calls.filter(c => c.options.method === 'PUT').every(c => c.options.body === '{}'), true);
  f.bindings.push({ type: 'kv_namespace', name: 'LEAK', namespace_id: recoveryId });
  let network = false;
  await assert.rejects(verifyRecovery(f.cf, record, recoveryId, async () => { network = true; }), /资源与恢复记录不一致/);
  assert.equal(network, false);
});

test('wrong account, malicious URLs, swapped resources, malformed records and missing values fail without recovery', async () => {
  const record = fixture();
  for (const mutation of [
    { version: 2 }, { accountId: 'd'.repeat(32) }, { workerUrl: 'https://attacker.workers.dev' },
    { workerUrl: record.workerUrl + '/path' }, { workerUrl: record.workerUrl + '?token=secret' },
    { kvId: '../other' }, { secrets: { write: record.secrets.write, read: record.secrets.write } },
    { names: { ...record.names, bucket: 'other-notes' } }, { label: '../invalid' },
  ]) assert.throws(() => validateRecord({ ...record, ...mutation }, account));
  const f = controlPlane(record);
  await assert.rejects(readRecovery(f.cf, account, recoveryId, 'deployment:' + record.names.worker), /尚未同步或已移除/);
  f.values.set('deployment:' + record.names.worker, { value: '{invalid' });
  await assert.rejects(readRecovery(f.cf, account, recoveryId, 'deployment:' + record.names.worker), /恢复记录无效/);
  f.spaces.push({ id: recoveryId, title: RECOVERY_TITLE }, { id: 'd'.repeat(32), title: RECOVERY_TITLE });
  await assert.rejects(discoverRecoveries(f.cf, account), /重名恢复空间/);
});

test('stale credentials and network/redirect errors are sanitized; no rotation or fallback', async () => {
  const record = fixture(), f = controlPlane(record);
  for (const fetcher of [async () => Response.json({}, { status: 401 }), async () => { throw new Error(record.secrets.write); }]) {
    await assert.rejects(verifyRecovery(f.cf, record, recoveryId, fetcher), error => /凭据已失效/.test(error.message) && !error.message.includes(record.secrets.write));
  }
  assert.equal(f.calls.every(c => c.method === 'GET'), true);
});

test('legacy backup resolves the actual recovery namespace and refuses to write into any Worker-bound KV', async () => {
  const record = fixture(), f = controlPlane(record);
  f.spaces.push({ id: recoveryId, title: RECOVERY_TITLE });
  f.bindings.push({ type: 'kv_namespace', name: 'UNEXPECTED_EXTRA', namespace_id: recoveryId });
  await assert.rejects(writeRecovery(f.cf, record), /恢复空间已绑定/);
  assert.equal(f.values.size, 0);
  assert.equal(f.calls.some(call => call.method === 'PUT'), false);
});

test('key discovery follows cursors and rejects a repeated cursor rather than looping', async () => {
  let page = 0;
  const cf = { list: async () => [{ id: recoveryId, title: RECOVERY_TITLE }], request: async url => {
    page++; assert.equal(new URL('https://fixture' + url).searchParams.get('cursor'), page === 1 ? null : 'next');
    return { result: [{ name: 'deployment:' + fixture().names.worker }], result_info: { cursor: page === 1 ? 'next' : '' } };
  } };
  assert.equal((await discoverRecoveries(cf, account)).records.length, 2); assert.equal(page, 2);
  cf.request = async () => ({ result: [], result_info: { cursor: 'repeated' } });
  await assert.rejects(discoverRecoveries(cf, account), /恢复记录无效/);
});

test('a failed recovery write preserves the healthy mirror and generated keys for a focused retry', async () => {
  const state = fixture(); delete state.kind; delete state.version; delete state.kvId;
  const originalSecrets = { ...state.secrets }; let backups = 0;
  const cf = { request: async (url, method) => url.endsWith('/workers/subdomain') ? { subdomain: 'fixture' }
    : url.endsWith('/settings') ? null : url.endsWith('/storage/kv/namespaces') && method === 'POST' ? { id: oauthId } : {} };
  await assert.rejects(deploy({ cf, state, module: 'export default {}', save: async () => {}, progress: () => {},
    fetcher: async url => Response.json(url.endsWith('/health') ? { service: 'obsidian-ai-mirror' } : { authorization_endpoint: state.workerUrl + '/authorize' }),
    saveRecovery: async () => { backups++; throw new Error('KV denied'); } }), /KV denied/);
  assert.equal(backups, 1); assert.equal(state.deployed, true); assert.deepEqual(state.secrets, originalSecrets);
});
