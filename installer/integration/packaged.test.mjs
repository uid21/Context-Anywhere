import assert from 'node:assert/strict';
import test from 'node:test';
import { constants } from 'node:crypto';
import { createServer } from 'node:https';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const setupVersion = JSON.parse(await readFile(path.join(repo, 'installer/package.json'), 'utf8')).version;
const bundle = process.env.CA_TEST_BUNDLE || path.join(repo, `installer/dist/Context-Anywhere-${setupVersion}-win-x64`);
const fixtures = path.join(repo, 'worker/test/fixtures/tls');
const pem = name => readFile(path.join(fixtures, name + '.pem'));
const account = 'a'.repeat(32);

test('packaged wizard survives hostile HTTPS, then authenticates and uploads the exact bundled Worker', { timeout: 30000 }, async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ca-packaged-security-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let attack = 'certificate', renegotiated = false, uploaded, metadata, recoveryValue, workerName, uploadCount = 0, failRecovery = true;
  const namespaces = [];
  const wrongHost = { key: await pem('wrong-key'), cert: await pem('wrong-cert') };
  const sockets = new Set();
  const server = createServer({
    key: await pem('matching-key'), cert: await pem('matching-cert'),
    minVersion: 'TLSv1.2', maxVersion: 'TLSv1.2',
    secureOptions: constants.SSL_OP_NO_SESSION_RESUMPTION_ON_RENEGOTIATION,
  }, async (req, res) => {
    if (attack === 'certificate') {
      req.socket.on('error', () => {});
      req.socket.setKeyCert(wrongHost);
      renegotiated = req.socket.renegotiate({ requestCert: false, rejectUnauthorized: false }, () => {});
      return;
    }
    if (attack === 'encoding') {
      res.writeHead(200, { 'Content-Encoding': 'gzip, gzip, gzip, gzip, gzip, gzip', 'Content-Length': '1', Connection: 'close' });
      res.flushHeaders(); req.socket.end(); return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    let result = {};
    if (req.url.startsWith('/client/v4/accounts?')) result = [{ id: account, name: 'Synthetic test account' }];
    else if (req.url.endsWith('/workers/subdomain')) result = { subdomain: 'fixture' };
    else if (req.url.endsWith('/settings')) { if (metadata) result = metadata; else { res.writeHead(404).end('{}'); return; } }
    else if (/\/storage\/kv\/namespaces\?/.test(req.url)) result = namespaces;
    else if (req.url.endsWith('/storage/kv/namespaces')) {
      const input = JSON.parse(body.toString());
      result = { id: (input.title === 'context-anywhere-recovery-v1' ? 'c' : 'b').repeat(32), title: input.title };
      namespaces.push(result);
    }
    else if (req.url.endsWith('/' + 'c'.repeat(32) + '/bulk')) {
      if (failRecovery) { res.writeHead(403).end(JSON.stringify({ success: false, errors: [{ code: 1000, message: 'Synthetic recovery failure' }] })); return; }
      recoveryValue = JSON.parse(JSON.parse(body.toString())[0].value);
    }
    else if (req.url.includes('/r2/buckets/')) result = { name: metadata.bindings.find(b => b.name === 'AI_MIRROR').bucket_name };
    else if (req.url.endsWith('/' + 'b'.repeat(32))) result = { id: 'b'.repeat(32) };
    else if (/\/workers\/scripts\/[^/]+$/.test(req.url) && req.method === 'PUT') {
      const form = await new Request('http://fixture', { method: 'POST', headers: req.headers, body }).formData();
      uploaded = Buffer.from(await form.get('index.js').arrayBuffer());
      metadata = JSON.parse(await form.get('metadata').text());
      workerName = req.url.split('/').at(-1); uploadCount++;
    } else if (req.url === '/health') { res.end(JSON.stringify({ service: 'obsidian-ai-mirror' })); return; }
    else if (req.url === '/note') {
      assert.equal(body.toString(), '{}');
      const write = metadata.bindings.find(b => b.name === 'MIRROR_TOKEN').text;
      res.writeHead(req.headers.authorization === 'Bearer ' + write ? 400 : 403).end(JSON.stringify({ error: 'invalid note' })); return;
    }
    else if (req.url === '/.well-known/oauth-authorization-server') { res.end(JSON.stringify({ authorization_endpoint: `https://${workerName}.fixture.workers.dev/authorize`, token_endpoint: `https://${workerName}.fixture.workers.dev/token` })); return; }
    else if (!req.url.endsWith('/r2/buckets') && !req.url.endsWith('/subdomain')) {
      res.writeHead(500).end('Unexpected test endpoint'); return;
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: true, result }));
  });
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  server.on('tlsClientError', () => {});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); });
  const origin = 'https://localhost:' + server.address().port;
  const preload = path.join(directory, 'route-test-endpoints.cjs');
  // Endpoint routing is test-only. The actual packaged fetch/TLS/decoder implementation runs unchanged.
  await writeFile(preload, [
    'const originalFetch = globalThis.fetch;',
    'globalThis.fetch = (input, options) => {',
    ' const url = new URL(input);',
    ' if (url.hostname !== "api.cloudflare.com" && !url.hostname.endsWith(".fixture.workers.dev")) throw new Error("Unexpected external endpoint");',
    ' return originalFetch(process.env.CA_TEST_ORIGIN + url.pathname + url.search, options);',
    '};',
    'require("node:fs").writeFileSync(process.env.CA_TEST_RUNTIME_REPORT, JSON.stringify({node:process.versions.node,undici:process.versions.undici,path:process.execPath}));',
  ].join('\n'));
  const runtimeReport = path.join(directory, 'runtime.json');
  const child = spawn(path.join(bundle, 'runtime/node.exe'), ['--require', preload, path.join(bundle, 'app/bridge.mjs')], {
    cwd: bundle, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, NODE_OPTIONS: '', NODE_EXTRA_CA_CERTS: path.join(fixtures, 'ca.pem'),
      CA_SETUP_ROOT: bundle, CA_SETUP_DATA_DIR: path.join(directory, 'state'), CA_SETUP_LANGUAGE: 'en',
      CA_TEST_ORIGIN: origin, CA_TEST_RUNTIME_REPORT: runtimeReport },
  });
  const pending = new Map();
  let sequence = 0, stderr = '';
  child.stderr.on('data', data => { stderr += data; });
  child.on('exit', code => { for (const { reject } of pending.values()) reject(new Error('Packaged backend exited ' + code + ': ' + stderr)); });
  child.on('error', error => { for (const { reject } of pending.values()) reject(error); });
  const lines = createInterface({ input: child.stdout });
  lines.on('line', line => {
    const response = JSON.parse(line);
    if (response.progress || response.event) return;
    const job = pending.get(response.id);
    if (job) { clearTimeout(job.timer); pending.delete(response.id); job.resolve(response); }
  });
  t.after(async () => {
    child.stdin.end();
    if (child.exitCode === null) await new Promise(resolve => {
      const timer = setTimeout(() => child.kill(), 2000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
    });
    lines.close();
  });
  const rpc = (action, input = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('RPC timed out: ' + action)); }, 10000);
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(JSON.stringify({ id, action, input, language: 'en' }) + '\n');
  });
  assert.equal((await rpc('state')).result.version, setupVersion);
  const runtime = JSON.parse(await readFile(runtimeReport));
  assert.equal(runtime.node, '22.23.4');
  assert.equal(runtime.undici, '6.29.1');
  assert.equal(path.resolve(runtime.path), path.resolve(bundle, 'runtime/node.exe'));
  for (const mode of ['certificate', 'encoding']) {
    attack = mode;
    const failure = await rpc('cloudflare.token', { token: 'synthetic-test-api-token' });
    assert.ok(failure.error, mode);
    assert.equal((await rpc('state')).result.authenticated, false);
  }
  assert.equal(renegotiated, true);
  attack = null;
  assert.equal((await rpc('cloudflare.token', { token: 'synthetic-test-api-token' })).result.authenticated, true);
  const vault = path.join(directory, 'vault'), plugin = path.join(vault, '.obsidian/plugins/ai-bridge');
  await mkdir(plugin, { recursive: true });
  await writeFile(path.join(plugin, 'manifest.json'), '{"id":"ai-bridge","version":"0.4.2"}');
  await writeFile(path.join(plugin, 'main.js'), '');
  await writeFile(path.join(vault, '.obsidian/community-plugins.json'), '["ai-bridge"]');
  assert.ok((await rpc('vault.inspect', { path: vault })).result.enabled);
  assert.equal((await rpc('recovery.list', { accountId: account })).state.recoveryChoice, 'new');
  const deployed = await rpc('deploy', { accountId: account, label: 'security-fixture', deviceName: 'Synthetic test device',
    includePrefixes: 'Inbox', cfAccountConfirmed: true, pluginConfirmed: true });
  assert.equal(deployed.result?.deployed, true, deployed.error);
  assert.deepEqual(uploaded, await readFile(path.join(bundle, 'payload/index.js')));
  const secrets = metadata.bindings.filter(item => item.type === 'secret_text');
  assert.equal(secrets.length, 2);
  assert.notEqual(secrets[0].text, secrets[1].text);
  assert.equal(deployed.state.recoverySaved, false);
  assert.match(deployed.result.warning, /mirror is ready/i);
  assert.ok((await rpc('manual')).result.url.endsWith('/mcp'));
  failRecovery = false;
  const retried = await rpc('recovery.backup');
  assert.equal(retried.result?.saved, true, retried.error || retried.result?.warning);
  assert.equal(uploadCount, 1, 'Recovery retry must not redeploy the Worker');
  assert.equal(recoveryValue.secrets.write, secrets.find(s => s.name === 'MIRROR_TOKEN').text);
  assert.equal(recoveryValue.secrets.read, secrets.find(s => s.name === 'MIRROR_READ_KEY').text);
  assert.equal(metadata.bindings.some(b => b.namespace_id === 'c'.repeat(32)), false);
  assert.equal(retried.state.recoverySaved, true);
  assert.ok((await rpc('manual')).result.url.endsWith('/mcp'));
  await rpc('close');
});
