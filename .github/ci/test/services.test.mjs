import assert from 'node:assert/strict';
import { constants, createHash, generateKeyPairSync, sign, verify } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createServer as httpsServer } from 'node:https';
import { createServer as netServer } from 'node:net';
import { createServer as tlsServer } from 'node:tls';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { getOctokit } from '@actions/github';
import { verifyRuntime } from '../verify-runtime.mjs';
import { publish } from '../release.mjs';
import { provenanceSubjects, windowsFiles } from '../files.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const sdkRequire = createRequire(require.resolve('@sigstore/sign'));
const { DSSEBundleBuilder } = sdkRequire('@sigstore/sign');
const { dsse } = sdkRequire('@sigstore/core');

async function listen(t, server) {
  const sockets = new Set();
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); });
  return `http://127.0.0.1:${server.address().port}`;
}

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'context-anywhere-ci-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'installer/dist'), { recursive: true });
  for (const [name, data] of Object.entries({
    'main.js': 'tested plugin', 'styles.css': 'body {}', 'manifest.json': '{"version":"1.2.3"}',
    'installer/package.json': '{"version":"0.2.3"}', 'installer/RELEASE-NOTES.md': 'Setup release',
    'installer/dist/Context-Anywhere-0.2.3-win-x64.zip': 'synthetic setup archive', 'installer/dist/SHA256SUMS.txt': 'synthetic checksums'
  })) await writeFile(join(root, name), data);
  return root;
}

function environment(t, values) {
  const saved = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  Object.assign(process.env, values);
  t.after(() => { for (const [key, value] of Object.entries(saved)) value === undefined ? delete process.env[key] : process.env[key] = value; });
}

function child(file, env) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, Array.isArray(file) ? file : [file], { env: { ...process.env, ...env }, windowsHide: true });
    let output = '';
    proc.stdout.on('data', chunk => output += chunk);
    proc.stderr.on('data', chunk => output += chunk);
    proc.on('error', reject);
    proc.on('exit', code => resolve({ code, output }));
  });
}

test('CI network SDKs and built-in fetch resolve the patched runtime and package', () => {
  assert.deepEqual(verifyRuntime(), { node: '22.23.4', builtinUndici: '6.29.1', sdkUndici: '6.29.1', copies: 1 });
});

test('actual GitHub SDK handles a hostile encoding chain without crashing, then still serves a normal request', { timeout: 15000 }, async t => {
  const bad = await listen(t, netServer(socket => socket.once('data', () => socket.end(
    'HTTP/1.1 200 OK\r\nContent-Encoding: gzip, gzip, gzip, gzip, gzip, gzip\r\nContent-Length: 1\r\nConnection: close\r\n\r\n'))));
  await assert.rejects(getOctokit('synthetic-test-token', { baseUrl: bad }).request('GET /repos/a/b'));
  await new Promise(resolve => setTimeout(resolve, 100));
  const good = await listen(t, createServer((req, res) => {
    assert.equal(req.headers.authorization, 'token synthetic-test-token');
    res.setHeader('Content-Type', 'application/json');
    res.end('{"id":123,"name":"healthy"}');
  }));
  assert.equal((await getOctokit('synthetic-test-token', { baseUrl: good }).request('GET /repos/a/b')).data.name, 'healthy');
});

test('SDK Undici keeps custom certificate rejection and survives a hostile TLS certificate swap', { timeout: 15000 }, async t => {
  const { Agent, Client, request } = await import('undici');
  const fixture = name => readFile(resolve(here, '../../../worker/test/fixtures/tls', name + '.pem'));
  const matching = { key: await fixture('matching-key'), cert: await fixture('matching-cert') };
  const wrongHost = { key: await fixture('wrong-key'), cert: await fixture('wrong-cert') };
  const ca = await fixture('ca');
  const lookup = (host, options, callback) => options.all ? callback(null, [{ address: '127.0.0.1', family: 4 }]) : callback(null, '127.0.0.1', 4);
  const url = (await listen(t, httpsServer(matching, (req, res) => res.end('must be rejected')))).replace('http://127.0.0.1', 'https://localhost');
  const agent = new Agent({ connect: { ca, lookup, checkServerIdentity() { return new Error('rejected by certificate policy'); } } });
  t.after(() => agent.destroy());
  await assert.rejects(request(url, { dispatcher: agent }), /certificate policy/);
  let swapped;
  const started = new Promise(resolve => { swapped = resolve; });
  const hostile = (await listen(t, tlsServer({ ...matching, minVersion: 'TLSv1.2', maxVersion: 'TLSv1.2', secureOptions: constants.SSL_OP_NO_SESSION_RESUMPTION_ON_RENEGOTIATION }, socket => {
    socket.on('error', () => {});
    socket.once('data', () => { socket.setKeyCert(wrongHost); swapped(socket.renegotiate({ requestCert: false, rejectUnauthorized: false }, () => {})); });
  }))).replace('http://127.0.0.1', 'https://localhost');
  const client = new Client(hostile, { connect: { ca, lookup, minVersion: 'TLSv1.2', maxVersion: 'TLSv1.2' } });
  t.after(() => client.destroy());
  const rejected = assert.rejects(client.request({ path: '/', method: 'GET' }), { code: 'ERR_TLS_CERT_ALTNAME_INVALID' });
  assert.equal(await started, true);
  await rejected;
});

test('Sigstore signs the correct UTF-8 envelope and a Unicode type substitution cannot reuse the signature', async () => {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const artifact = { type: 'application/vnd.in-toto+json', data: Buffer.from('{"verified":"build"}') };
  let signed;
  const bundle = await new DSSEBundleBuilder({ witnesses: [], signer: { async sign(data) {
    signed = data;
    return { signature: sign('sha256', data, privateKey), key: { $case: 'publicKey', publicKey: publicKey.export({ format: 'pem', type: 'spki' }) } };
  } } }).create(artifact);
  const envelope = bundle.content.dsseEnvelope;
  const signature = envelope.signatures[0].sig;
  assert.equal(verify('sha256', dsse.preAuthEncoding(artifact.type, artifact.data), publicKey, signature), true);
  const changedType = artifact.type.replace('a', '\u0161');
  assert.equal(verify('sha256', dsse.preAuthEncoding(changedType, artifact.data), publicKey, signature), false);
  assert.deepEqual(signed, Buffer.concat([Buffer.from(`DSSEv1 ${Buffer.byteLength(artifact.type)} ${artifact.type} ${artifact.data.length} `), artifact.data]));
});

test('provenance SDK validates a signed OIDC token and binds the exact commit; forged identity fails', { timeout: 15000 }, async t => {
  const { generateKeyPair, exportJWK, SignJWT } = await import('jose');
  const keys = await generateKeyPair('RS256');
  const jwk = { ...await exportJWK(keys.publicKey), kid: 'local-test-key', alg: 'RS256' };
  let token;
  const url = await listen(t, createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url.startsWith('/token')) res.end(JSON.stringify({ value: token }));
    else if (req.url === '/.well-known/openid-configuration') res.end(JSON.stringify({ jwks_uri: url + '/keys' }));
    else if (req.url === '/keys') res.end(JSON.stringify({ keys: [jwk] }));
    else { res.statusCode = 404; res.end('{}'); }
  }));
  environment(t, { GITHUB_SERVER_URL: 'https://github.com', ACTIONS_ID_TOKEN_REQUEST_URL: url + '/token?existing=true', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'synthetic-token' });
  const claims = { ref: 'refs/tags/1.2.3', sha: 'a'.repeat(40), repository: 'test/repo', event_name: 'push', job_workflow_ref: 'test/repo/.github/workflows/release.yml@refs/tags/1.2.3', workflow_ref: 'test/repo/.github/workflows/release.yml@refs/tags/1.2.3', repository_id: '1', repository_owner_id: '2', runner_environment: 'github-hosted', run_id: '3', run_attempt: '1' };
  token = await new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: jwk.kid }).setIssuer(url).setAudience('nobody').setExpirationTime('1m').sign(keys.privateKey);
  const { buildSLSAProvenancePredicate } = await import('@actions/attest');
  const result = await buildSLSAProvenancePredicate(url);
  assert.equal(result.params.buildDefinition.resolvedDependencies[0].digest.gitCommit, claims.sha);
  assert.equal(result.params.buildDefinition.externalParameters.workflow.path, '.github/workflows/release.yml');
  const parts = token.split('.');
  parts[1] = Buffer.from(JSON.stringify({ ...claims, sha: 'b'.repeat(40), iss: url, aud: 'nobody' })).toString('base64url');
  token = parts.join('.');
  await assert.rejects(buildSLSAProvenancePredicate(url), /signature verification failed/);
});

test('provenance subjects hash only the three shipped plugin files and change when a shipped byte changes', async t => {
  const root = await fixture(t);
  const before = await provenanceSubjects(root);
  assert.deepEqual(before.map(subject => subject.name), ['main.js', 'manifest.json', 'styles.css']);
  await writeFile(join(root, 'main.js'), 'changed build');
  const after = await provenanceSubjects(root);
  assert.notEqual(before[0].digest.sha256, after[0].digest.sha256);
  assert.deepEqual(before.slice(1), after.slice(1));
  assert.equal((await windowsFiles(root)).length, 2);
});

test('official provenance storage uploads the signed bundle and reports denied writes as failures', { timeout: 15000 }, async t => {
  let requests = 0, stored;
  const url = await listen(t, createServer(async (req, res) => {
    assert.equal(req.url, '/repos/test/repo/attestations');
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    stored = JSON.parse(Buffer.concat(chunks));
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = ++requests > 1 ? 403 : 201;
    res.end(requests > 1 ? '{"message":"permission denied"}' : '{"id":"receipt-42"}');
  }));
  const bundle = { mediaType: 'application/vnd.dev.sigstore.bundle.v0.3+json', dsseEnvelope: { payloadType: 'application/vnd.in-toto+json', payload: 'synthetic-payload', signatures: [] } };
  // The GitHub SDK captures its base URL at module initialization. Start a
  // fresh process with the isolated endpoint set before any SDK is imported.
  const storeModule = new URL('../node_modules/@actions/attest/lib/store.js', import.meta.url).href;
  const result = await child(['--input-type=module', '--eval', `
    const { writeAttestation } = await import(${JSON.stringify(storeModule)});
    const bundle = JSON.parse(process.env.TEST_BUNDLE);
    const receipt = await writeAttestation(bundle, 'synthetic-token', { retry: 0 });
    let rejection;
    try { await writeAttestation(bundle, 'synthetic-token', { retry: 0 }); }
    catch (error) { rejection = error.message; }
    console.log(JSON.stringify({ receipt, rejection }));
  `], { GITHUB_API_URL: url, GITHUB_REPOSITORY: 'test/repo', TEST_BUNDLE: JSON.stringify(bundle) });
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /receipt-42/);
  assert.deepEqual(stored.bundle, bundle);
  assert.match(result.output, /permission denied/);
});

test('local Action launches the pinned runtime and uploads real archive bytes through the official artifact SDK', { timeout: 30000 }, async t => {
  const root = await fixture(t);
  let archive, finalized, created;
  const url = await listen(t, createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    if (req.url.endsWith('/CreateArtifact')) {
      created = JSON.parse(body);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true, signedUploadUrl: url + '/devstoreaccount1/container/archive.zip' }));
    } else if (req.url.endsWith('/FinalizeArtifact')) {
      finalized = JSON.parse(body);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true, artifactId: '42' }));
    } else if (req.url.startsWith('/devstoreaccount1/')) {
      if (new URL(req.url, url).searchParams.get('comp') === 'block') archive = body;
      res.statusCode = 201; res.end();
    } else { res.statusCode = 404; res.end(); }
  }));
  const token = ['e30', Buffer.from(JSON.stringify({ scp: 'Actions.Results:test-run:test-job' })).toString('base64url'), 'synthetic'].join('.');
  const output = join(root, 'outputs.txt'), summary = join(root, 'summary.md');
  await writeFile(output, ''); await writeFile(summary, '');
  const result = await child(join(here, '../launch.cjs'), {
    CI_NODE: process.execPath, INPUT_OPERATION: 'upload', GITHUB_WORKSPACE: root,
    ACTIONS_RUNTIME_TOKEN: token, ACTIONS_RESULTS_URL: url, GITHUB_OUTPUT: output,
    GITHUB_STEP_SUMMARY: summary, GITHUB_SERVER_URL: 'https://github.com', GITHUB_REPOSITORY: 'test/repo', GITHUB_RUN_ID: '123'
  });
  assert.equal(result.code, 0, result.output);
  assert.equal(created.name, 'Context-Anywhere-Windows-Setup');
  assert.ok(archive?.length > 0, 'Actual ZIP bytes reached blob storage');
  assert.equal(finalized.hash, 'sha256:' + createHash('sha256').update(archive).digest('hex'));
  assert.match(await readFile(output, 'utf8'), /artifact-id[\s\S]*42/);
  assert.match(archive.toString('latin1'), /Context-Anywhere-0.2.3-win-x64.zip/);
  assert.match(archive.toString('latin1'), /SHA256SUMS.txt/);
  assert.doesNotMatch(archive.toString('latin1'), /main\.js|services\.test/);
});

test('release creation preserves plugin notes and Windows draft semantics; mismatched tags and permission failures fail closed', async t => {
  const root = await fixture(t);
  for (const kind of ['plugin', 'windows']) {
    const calls = [];
    const execute = (command, args) => { assert.equal(command, 'gh'); calls.push(args); return args[0] === 'api' ? { status: 1, stderr: 'HTTP 404' } : { status: 0 }; };
    const env = { GITHUB_REPOSITORY: 'test/repo', GH_TOKEN: 'synthetic', GITHUB_REF_NAME: kind === 'windows' ? 'windows-setup-v0.2.3' : '1.2.3' };
    await publish(kind, { root, env, execute });
    const args = calls[1];
    assert.deepEqual(args.slice(0, 2), ['release', 'create']);
    assert.ok(args.includes('--verify-tag'));
    assert.equal(args.includes('--draft'), kind === 'windows');
    assert.equal(args.includes('--prerelease'), kind === 'windows');
    assert.equal(args.includes('--generate-notes'), kind === 'plugin');
    assert.equal(args.filter(value => value.endsWith('main.js')).length, 1);
    await assert.rejects(publish(kind, { root, env: { ...env, GITHUB_REF_NAME: 'wrong-tag' }, execute }), /tag does not match/);
    await assert.rejects(publish(kind, { root, env, execute: () => ({ status: 1, stderr: 'HTTP 403' }) }), /403/);
  }
});

test('release reruns update existing assets but never publish a Windows draft', async t => {
  const root = await fixture(t), calls = [];
  const env = { GITHUB_REPOSITORY: 'test/repo', GH_TOKEN: 'synthetic', GITHUB_REF_NAME: 'windows-setup-v0.2.3' };
  const execute = (_, args) => { calls.push(args); return { status: 0, stdout: args[0] === 'api' ? '{"draft":true,"prerelease":true}' : '' }; };
  await publish('windows', { root, env, execute });
  assert.deepEqual(calls[1].slice(0, 2), ['release', 'upload']);
  assert.ok(calls[1].includes('--clobber'));
  await assert.rejects(publish('windows', { root, env, execute: () => ({ status: 0, stdout: '{"draft":false,"prerelease":true}' }) }), /unpublished/);
});
