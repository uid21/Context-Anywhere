import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Cloudflare, deploy, resourceNames } from '../src/cloudflare.mjs';
import { settingsFrom, inspectVault, previewVault, prepareImport, verifyImport } from '../src/obsidian.mjs';
import { Store } from '../src/storage.mjs';
import { verifyMirror } from '../src/browser.mjs';
import { consumeSetupImport } from '../../src/setup-import.js';

const options = { deviceName: 'Test Windows', includePrefixes: 'Inbox', syncOnChange: true };
test('AI connection checks live OAuth metadata and rejects missing or redirected mirrors', async () => {
  const origin = 'https://test.example.workers.dev';
  await verifyMirror(origin, async () => Response.json({ authorization_endpoint: origin + '/authorize', token_endpoint: origin + '/token' }));
  for (const response of [new Response('missing', {status:404}), Response.json({}), Response.json({authorization_endpoint:'https://other.example/authorize',token_endpoint:origin+'/token'})]) {
    await assert.rejects(verifyMirror(origin, async () => response), /镜像暂时无法连接/);
  }
  await assert.rejects(verifyMirror(origin, async () => { throw new Error('network'); }), /镜像暂时无法连接/);
});
test('selected folders and excluded configuration are counted without reading notes', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ca-setup-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const plugin = path.join(directory, '.obsidian', 'plugins', 'ai-bridge');
  await mkdir(plugin, { recursive: true }); await mkdir(path.join(directory, 'Inbox')); await mkdir(path.join(directory, 'Private')); await mkdir(path.join(directory, 'AI Bridge Conflicts'));
  await writeFile(path.join(plugin, 'manifest.json'), JSON.stringify({ id: 'ai-bridge', version: '0.4.1' })); await writeFile(path.join(plugin, 'main.js'), '');
  await writeFile(path.join(directory, '.obsidian', 'community-plugins.json'), '["ai-bridge"]');
  for (const name of ['Inbox/a.md', 'Private/b.md', '.obsidian/config.md', 'AI Bridge Conflicts/a.md']) await writeFile(path.join(directory, name), 'fixture');
  const vault = await inspectVault(directory); assert.equal(vault.enabled, true);
  assert.equal((await previewVault(vault, settingsFrom(options))).notes, 1);
  assert.equal((await previewVault(vault, settingsFrom({ ...options, includePrefixes: '', mirrorAll: true }))).notes, 2);
  await writeFile(path.join(plugin, 'data.json'), JSON.stringify({ ...settingsFrom(options), workerUrl: 'https://example.workers.dev', token: 'different-token' }));
  assert.equal((await verifyImport(vault, { token: 'expected-token' })).imported, false);
});

test('passwordless local handoff binds the vault, expires and cannot replay', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'C+A test-'));
  t.after(() => rm(directory, {recursive:true,force:true}));
  const plugin = path.join(directory,'.obsidian','plugins','ai-bridge'); await mkdir(plugin,{recursive:true});
  const vault={path:directory,name:path.basename(directory),configDir:'.obsidian',enabled:true,localImportSupported:true};
  const payload={...settingsFrom(options),workerUrl:'https://test.workers.dev',token:'synthetic-write-token-value',installerSetup:true};
  const adapter={getBasePath:()=>directory,read:file=>readFile(path.join(directory,file),'utf8'),remove:file=>rm(path.join(directory,file))};
  const handoff=await prepareImport(vault,payload);t.after(()=>handoff.close());
  const uri=new URL(handoff.uri);const params=Object.fromEntries(uri.searchParams);
  assert.equal(decodeURIComponent(uri.search.match(/[?&]vault=([^&]+)/)[1]),vault.name);
  assert.equal(uri.href.includes(payload.token),false);assert.equal(uri.searchParams.has('data'),false);
  await assert.rejects(consumeSetupImport(adapter,'.obsidian',{...params,path:directory+'-other'}),/selected/);
  assert.deepEqual(await consumeSetupImport(adapter,'.obsidian',params),payload);
  await assert.rejects(consumeSetupImport(adapter,'.obsidian',params),/ENOENT/);
  const expired=await prepareImport(vault,payload);t.after(()=>expired.close());
  await assert.rejects(consumeSetupImport(adapter,'.obsidian',Object.fromEntries(new URL(expired.uri).searchParams),Date.now()+121000),/expired/);
  await assert.rejects(prepareImport({...vault,localImportSupported:false},payload),/当前 AI Bridge 版本暂不支持/);
  const closed=await prepareImport(vault,payload);await closed.close();
  await assert.rejects(consumeSetupImport(adapter,'.obsidian',Object.fromEntries(new URL(closed.uri).searchParams)),/ENOENT/);
});

test('configuration requires deliberate scope and rejects traversal', () => {
  assert.throws(() => settingsFrom({ ...options, includePrefixes: '' }), /勾选/);
  assert.throws(() => settingsFrom({ ...options, includePrefixes: '../Private' }), /相对路径/);
  assert.throws(() => settingsFrom({ ...options, maxAttachmentMiB: 9 }), /1–8/);
  assert.throws(() => settingsFrom({ ...options, autoSyncIntervalMinutes: 0 }), /1–1440/);
  assert.deepEqual(resourceNames('my-context', 'ab12cd34'), { worker: 'my-context-ab12cd34', bucket: 'my-context-ab12cd34-notes', kvTitle: 'my-context-ab12cd34-oauth' });
});

function fixtureState() { return { accountId: 'a'.repeat(32), id: 'ab12cd34', names: resourceNames('my-context', 'ab12cd34'), secrets: { write: 'fixture-write', read: 'fixture-read' } }; }
test('an existing unrelated Worker prevents all resource mutations', async () => {
  const calls = [];
  const cf = { request: async (url, method = 'GET') => { calls.push([url, method]); return url.endsWith('/subdomain') ? { subdomain: 'fixture' } : { tags: ['production'] }; } };
  await assert.rejects(deploy({ cf, state: fixtureState(), module: 'export default {}', save: async () => {}, progress: () => {} }), /不会覆盖/);
  assert.equal(calls.some(([, method]) => method !== 'GET'), false);
});

test('partial deployment resumes with the same R2/KV and distinct read/write secret bindings', async () => {
  const state = fixtureState(); state.bucketCreated = true; state.kvId = 'fixture-kv';
  const calls = []; let metadata;
  const cf = { request: async (url, method = 'GET', body) => {
    calls.push([url,method]);
    if (url.endsWith('/settings')) return { tags: [`context-anywhere-setup:${state.id}`] };
    if (url.endsWith('/workers/subdomain')) return { subdomain: 'fixture' };
    if (url.endsWith(`/r2/buckets/${state.names.bucket}`) && method === 'GET') return { name: state.names.bucket };
    if (url.endsWith(`/storage/kv/namespaces/${state.kvId}`) && method === 'GET') return { id: state.kvId };
    if (body instanceof FormData) metadata = JSON.parse(await body.get('metadata').text());
    return {};
  } };
  await deploy({ cf, state, module: 'export default {}', save: async () => {}, progress: () => {}, fetcher: async url => new Response(JSON.stringify(url.endsWith('/health') ? { service: 'obsidian-ai-mirror' } : { authorization_endpoint: 'https://fixture/authorize' })) });
  assert.equal(calls.some(([url,method]) => method === 'POST' && /buckets$|namespaces$/.test(url)), false);
  assert.deepEqual(metadata.bindings.filter(binding => binding.type === 'secret_text').map(binding => binding.text), ['fixture-write','fixture-read']);
  assert.equal(state.deployed, true);
});

test('a first Workers account can register a subdomain without changing an existing one', async () => {
  const state = fixtureState(); state.workersSubdomain = 'my-first-notes';
  const mutations = [];
  const cf = { request: async (url, method = 'GET', body) => {
    if (method !== 'GET') mutations.push([url, method, body]);
    if (url.endsWith('/workers/subdomain')) return method === 'PUT' ? { subdomain: body.subdomain } : null;
    if (url.endsWith('/settings')) return null;
    if (url.endsWith('/namespaces')) return { id: 'fixture-new-kv' };
    return {};
  } };
  await deploy({ cf, state, module: 'export default {}', save: async () => {}, progress: () => {}, fetcher: async url => new Response(JSON.stringify(url.endsWith('/health') ? { service: 'obsidian-ai-mirror' } : { authorization_endpoint: 'https://fixture/authorize' })) });
  assert.deepEqual(mutations.find(([url]) => url.endsWith('/workers/subdomain')).slice(1), ['PUT', { subdomain: 'my-first-notes' }]);
  assert.equal(state.workerUrl, 'https://my-context-ab12cd34.my-first-notes.workers.dev');
});

test('Cloudflare provider failures never disclose response body or bearer tokens', async () => {
  const cf = new Cloudflare('sensitive-fixture', async () => new Response(JSON.stringify({ success: false, errors: [{ code: 1001, message: 'sensitive-fixture' }] }), { status: 403 }));
  await assert.rejects(cf.request('/accounts'), error => error.message.includes('1001') && !error.message.includes('sensitive-fixture'));
});

test('deleted cloud resources are recreated before uploading and stale KV IDs are never reused', async () => {
  const state = fixtureState(); state.bucketCreated = true; state.kvId = 'deleted-kv'; state.deployed = true; state.workerUploaded = true;
  const mutations = [], saved = []; let metadata;
  const cf = { request: async (url, method = 'GET', body) => {
    if (method !== 'GET') mutations.push([url, method]);
    if (url.endsWith('/workers/subdomain')) return { subdomain: 'fixture' };
    if (method === 'GET' && (url.endsWith('/settings') || url.includes('/r2/buckets/') || url.includes('/storage/kv/namespaces/'))) return null;
    if (url.endsWith('/storage/kv/namespaces') && method === 'POST') return { id: 'replacement-kv' };
    if (body instanceof FormData) metadata = JSON.parse(await body.get('metadata').text());
    return {};
  } };
  await deploy({ cf, state, module: 'export default {}', save: async () => saved.push(JSON.parse(JSON.stringify(state))), progress: () => {},
    fetcher: async url => Response.json(url.endsWith('/health') ? { service: 'obsidian-ai-mirror' } : { authorization_endpoint: 'https://fixture/authorize' }) });
  assert.equal(mutations.filter(([url, method]) => method === 'POST' && url.endsWith('/r2/buckets')).length, 1);
  assert.equal(mutations.filter(([url, method]) => method === 'POST' && url.endsWith('/storage/kv/namespaces')).length, 1);
  assert.equal(metadata.bindings.find(binding => binding.type === 'kv_namespace').namespace_id, 'replacement-kv');
  assert.equal(saved[0].deployed, false); assert.equal(saved[0].kvId, undefined); assert.equal(saved[0].bucketCreated, false);
  assert.equal(state.deployed, true); assert.deepEqual(state.secrets, fixtureState().secrets);
});

test('a resource permission failure never triggers replacement or changes the receipt', async () => {
  const state = fixtureState(); state.bucketCreated = true; state.kvId = 'existing-kv'; state.deployed = true;
  const original = JSON.stringify(state); const mutations = []; let saved = false;
  const cf = { request: async (url, method = 'GET') => {
    if (method !== 'GET') mutations.push(url);
    if (url.endsWith('/workers/subdomain')) return { subdomain: 'fixture' };
    if (url.endsWith('/settings')) return { tags: [`context-anywhere-setup:${state.id}`] };
    if (url.includes('/storage/kv/')) throw new Error('permission denied');
    return { name: state.names.bucket };
  } };
  await assert.rejects(deploy({ cf, state, module: '', save: async () => { saved = true; }, progress: () => {} }), /permission denied/);
  assert.equal(saved, false); assert.deepEqual(mutations, []); assert.equal(JSON.stringify(state), original);
});

test('10041 reports a missing KV binding without blaming R2 or leaking provider details', async () => {
  const cf = new Cloudflare('private-token', async () => Response.json({ success: false, errors: [{ code: 10041, message: 'private-token provider-body' }] }, { status: 400 }));
  await assert.rejects(cf.request('/accounts/test/workers/scripts/test', 'PUT', new FormData()), error =>
    error.message.includes('KV 存储不存在') && !error.message.includes('R2') && !error.message.includes('private-token') && !error.message.includes('provider-body'));
});

test('Windows deployment receipt uses DPAPI and resumes the same credentials', { skip: process.platform !== 'win32' }, async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ca-dpapi-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new Store(directory), value = fixtureState(); await store.save(value);
  assert.deepEqual(await store.load(), value);
  assert.equal((await readFile(store.file)).includes(Buffer.from(value.secrets.write)), false);
});
