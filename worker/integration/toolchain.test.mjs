import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const root = fileURLToPath(new URL('../', import.meta.url));
const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(CLOUDFLARE_|CF_|WRANGLER_)/.test(key)));
function run(args, env, input = '') {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'scripts/wrangler.mjs'), ...args], {
      cwd: root, env: { ...environment, WRANGLER_SEND_METRICS: 'false', CI: 'true', ...env },
      windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000,
    });
    let output = '';
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { output += data; });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(output) : reject(new Error('Wrangler exited ' + code + '\n' + output)));
    child.stdin.end(input);
  });
}

test('manual CLI creates R2/KV and uploads a secret through real HTTP with the repaired client', { timeout: 60000 }, async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ca-cli-security-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const config = path.join(directory, 'wrangler.toml');
  await writeFile(config, 'name = "ca-security-fixture"\naccount_id = "' + 'a'.repeat(32) + '"\ncompatibility_date = "2026-08-29"\n');
  const received = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString();
    received.push({ method: req.method, url: req.url, body });
    assert.equal(req.headers.authorization, 'Bearer synthetic-test-api-token');
    let result;
    if (req.url.endsWith('/r2/buckets')) result = { name: 'ca-security-notes' };
    else if (req.url.endsWith('/storage/kv/namespaces')) result = { id: 'b'.repeat(32), title: 'ca-security-oauth' };
    else if (req.url.endsWith('/secrets')) result = {};
    else { res.writeHead(500).end('Unexpected test endpoint'); return; }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: true, errors: [], messages: [], result }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const env = {
    CLOUDFLARE_API_TOKEN: 'synthetic-test-api-token', CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32),
    CLOUDFLARE_API_BASE_URL: 'http://127.0.0.1:' + server.address().port + '/client/v4',
    NO_PROXY: '127.0.0.1,localhost', WRANGLER_HOME: directory,
  };
  for (const args of [
    ['r2', 'bucket', 'create', 'ca-security-notes'],
    ['kv', 'namespace', 'create', 'ca-security-oauth'],
    ['secret', 'put', 'MIRROR_READ_KEY'],
  ]) await run([...args, '--config', config], env, 'synthetic-read-password\n');
  assert.equal(received.filter(row => row.method === 'POST').length, 2);
  const secret = received.find(row => row.url.endsWith('/secrets'));
  assert.equal(secret.method, 'PUT');
  assert.deepEqual(JSON.parse(secret.body), { name: 'MIRROR_READ_KEY', text: 'synthetic-read-password', type: 'secret_text' });
});

test('built Worker runs in workerd: upload/read/search, read-only rejection, OAuth discovery', { timeout: 30000 }, async t => {
  const mf = new Miniflare(convertV4MiniflareOptions({
    host: '127.0.0.1', port: 0,
    workers: [{ name: 'ca-security-fixture',
    modules: true, scriptPath: process.env.CA_TEST_PAYLOAD || path.join(root, '.wrangler-dry-run/index.js'),
    compatibilityDate: '2026-08-29', compatibilityFlags: ['nodejs_compat', 'global_fetch_strictly_public'],
    r2Buckets: ['AI_MIRROR'], kvNamespaces: ['OAUTH_KV'],
    bindings: { MIRROR_TOKEN: 'synthetic-write-key', MIRROR_READ_KEY: 'synthetic-read-key' },
    }],
  }));
  t.after(() => mf.dispose());
  const origin = String(await mf.ready);
  const request = (route, token, options = {}) => fetch(new URL(route, origin), {
    ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
  });
  assert.equal((await request('/health')).status, 401);
  assert.equal((await (await request('/health', 'synthetic-write-key')).json()).service, 'obsidian-ai-mirror');
  const note = JSON.stringify({ path: 'Inbox/security-fixture.md', content: 'safe networking fixture', mtime: Date.now() });
  assert.equal((await request('/note', 'synthetic-read-key', { method: 'PUT', body: note })).status, 403);
  assert.equal((await request('/note', 'synthetic-write-key', { method: 'PUT', body: note })).status, 200);
  const saved = await (await request('/note?path=Inbox/security-fixture.md', 'synthetic-read-key')).json();
  assert.equal(saved.content, 'safe networking fixture');
  const search = await (await request('/search?q=networking', 'synthetic-read-key')).json();
  assert.equal(search.matches[0].path, 'Inbox/security-fixture.md');
  const discovery = await (await request('/.well-known/oauth-authorization-server')).json();
  assert.ok(discovery.authorization_endpoint.endsWith('/authorize'));
});
