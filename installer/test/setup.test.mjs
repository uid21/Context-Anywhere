import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { webcrypto } from 'node:crypto';
import { Cloudflare, deploy, resourceNames } from '../src/cloudflare.mjs';
import { settingsFrom, inspectVault, previewVault, transferLink, verifyImport } from '../src/obsidian.mjs';
import { Store } from '../src/storage.mjs';
import { debugEndpoint } from '../src/chrome.mjs';

const options = { deviceName: 'Test Windows', includePrefixes: 'Inbox', syncOnChange: true };
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

test('encrypted handoff is compatible with plugin Web Crypto and binds the chosen vault', async () => {
  const payload = { ...settingsFrom(options), workerUrl: 'https://test.workers.dev', token: 'write-secret-fixture', installerSetup: true };
  const uri = new URL(await transferLink({ name: 'C-A test', path: 'C:\\Notes\\C-A test' }, payload, 'temporary-fixture-password'));
  assert.equal(uri.searchParams.get('vault'), 'C-A test'); assert.equal(uri.searchParams.get('path'), 'C:\\Notes\\C-A test');
  const rawQuery = Object.fromEntries(uri.search.slice(1).split('&').map(pair => pair.split('=')));
  assert.equal(decodeURIComponent(rawQuery.vault), 'C-A test');
  assert.equal(decodeURIComponent(rawQuery.path), 'C:\\Notes\\C-A test');
  const plusUri = new URL(await transferLink({ name: 'C+A test', path: 'C:\\Notes\\C+A test' }, payload, 'temporary-fixture-password'));
  assert.equal(decodeURIComponent(plusUri.search.match(/[?&]vault=([^&]+)/)[1]), 'C+A test');
  assert.equal(uri.href.includes(payload.token), false);
  const bytes = name => Buffer.from(uri.searchParams.get(name), 'base64url');
  const material = await webcrypto.subtle.importKey('raw', new TextEncoder().encode('temporary-fixture-password'), 'PBKDF2', false, ['deriveKey']);
  const key = await webcrypto.subtle.deriveKey({ name: 'PBKDF2', salt: bytes('salt'), iterations: 150000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const decrypted = await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes('iv') }, key, bytes('data'));
  assert.deepEqual(JSON.parse(new TextDecoder().decode(decrypted)), payload);
  const tampered = bytes('data'); tampered[0] ^= 1;
  await assert.rejects(webcrypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes('iv') }, key, tampered));
});

test('configuration requires deliberate scope and rejects traversal and remote DevTools', () => {
  assert.throws(() => settingsFrom({ ...options, includePrefixes: '' }), /明确勾选/);
  assert.throws(() => settingsFrom({ ...options, includePrefixes: '../Private' }), /相对路径/);
  assert.throws(() => settingsFrom({ ...options, maxAttachmentMiB: 9 }), /1–8/);
  assert.throws(() => settingsFrom({ ...options, autoSyncIntervalMinutes: 0 }), /1–1440/);
  assert.throws(() => debugEndpoint('https://example.com'), /端口/);
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

test('Windows deployment receipt uses DPAPI and resumes the same credentials', { skip: process.platform !== 'win32' }, async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ca-dpapi-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new Store(directory), value = fixtureState(); await store.save(value);
  assert.deepEqual(await store.load(), value);
  assert.equal((await readFile(store.file)).includes(Buffer.from(value.secrets.write)), false);
});
