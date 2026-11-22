import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomBytes, webcrypto } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const workerRoot = fileURLToPath(new URL('../', import.meta.url));
const payload = process.env.CA_TEST_PAYLOAD || path.join(workerRoot, '.wrangler-dry-run/index.js');
const readKey = 'synthetic-mirror-read-password';
const readKey2 = 'synthetic-second-read-password';
const writeKey = 'synthetic-mirror-write-token';
async function mirror(t, name) {
  const options = overrides => convertV4MiniflareOptions({
    host: '127.0.0.1', port: 0, cf: false,
    workers: [{ name, modules: true, scriptPath: payload, compatibilityDate: '2026-08-29',
      compatibilityFlags: ['nodejs_compat', 'global_fetch_strictly_public'],
      r2Buckets: ['AI_MIRROR'], kvNamespaces: ['OAUTH_KV'],
      bindings: { MIRROR_TOKEN: writeKey, MIRROR_READ_KEY: readKey, ...overrides },
    }],
  });
  const mf = new Miniflare(options());
  t.after(() => mf.dispose());
  const origin = (await mf.ready).origin;
  const request = (route, init = {}) => fetch(new URL(route, origin), { ...init, redirect: 'manual' });
  const setBindings = async bindings => { await mf.setOptions(options(bindings)); await mf.ready; };
  return { mf, origin, request, setBindings, setSecondary: key => setBindings({ MIRROR_READ_KEY_2: key }) };
}
async function authorize(app, password = readKey, { redirectUri = 'http://localhost/callback', confidential = false,
  clientName = 'Security acceptance client' } = {}) {
  const discovery = await app.request('/.well-known/oauth-authorization-server');
  assert.equal(discovery.status, 200);
  const metadata = await discovery.json();
  assert.ok(metadata.response_types_supported.includes('code'));
  assert.ok(metadata.code_challenge_methods_supported.includes('S256'));
  assert.ok(metadata.grant_types_supported.includes('refresh_token'));
  assert.ok(metadata.scopes_supported.includes('mcp:read'));
  for (const name of ['registration_endpoint', 'authorization_endpoint', 'token_endpoint']) {
    assert.equal(new URL(metadata[name]).origin, app.origin);
  }
  const registration = await app.request(metadata.registration_endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_name: clientName, redirect_uris: [redirectUri],
      token_endpoint_auth_method: confidential ? 'client_secret_basic' : 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] }),
  });
  assert.equal(registration.status, 201, await registration.clone().text());
  const client = await registration.json();
  const verifier = randomBytes(32).toString('base64url');
  const params = new URLSearchParams({ client_id: client.client_id, redirect_uri: redirectUri,
    response_type: 'code', scope: 'mcp:read', state: 'synthetic-state', resource: app.origin + '/mcp',
    code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url') });
  const page = await app.request(metadata.authorization_endpoint + '?' + params);
  assert.equal(page.status, 200);
  const body = await page.text();
  const csrf = /name="csrf" value="([^"]+)"/.exec(body)?.[1];
  assert.ok(csrf);
  const cookie = page.headers.get('set-cookie').split(';')[0];
  const consent = fields => app.request(metadata.authorization_endpoint + '?' + params, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie, Origin: app.origin },
    body: new URLSearchParams({ decision: 'allow', csrf, password, ...fields }),
  });
  assert.equal((await consent({ csrf: 'wrong-csrf' })).status, 403);
  assert.equal((await consent({ password: 'wrong-password' })).status, 401);
  assert.equal((await consent({ password: writeKey })).status, 401);
  const approved = await consent({});
  assert.equal(approved.status, 200);
  const html = await approved.text();
  const target = /content="0;url=([^"]+)"/.exec(html)?.[1]?.replaceAll('&amp;', '&');
  assert.ok(target, html);
  const callback = new URL(target);
  assert.equal(callback.origin + callback.pathname, redirectUri);
  assert.equal(callback.searchParams.get('state'), 'synthetic-state');
  const code = callback.searchParams.get('code');
  const exchange = fields => app.request(metadata.token_endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded',
      ...(confidential ? { Authorization: 'Basic ' + Buffer.from(client.client_id + ':' + client.client_secret).toString('base64') } : {}) },
    body: new URLSearchParams({ grant_type: 'authorization_code', ...(confidential ? {} : { client_id: client.client_id }),
      code, code_verifier: verifier, redirect_uri: redirectUri, resource: app.origin + '/mcp', ...fields }),
  });
  const response = await exchange({});
  assert.equal(response.status, 200, await response.clone().text());
  const tokens = await response.json();
  assert.ok(tokens.access_token);
  return { client, tokens, replayCode: () => exchange({}) };
}
async function rpc(app, token, method, params, extra = {}) {
  const response = await app.request('/mcp', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2025-11-25', Authorization: 'Bearer ' + token, ...extra },
    body: JSON.stringify({ jsonrpc: '2.0', id: 7, method, ...(params ? { params } : {}) }),
  });
  const text = await response.text();
  if (response.headers.get('content-type')?.includes('text/event-stream')) {
    const events = text.split('\n').filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6)));
    return { response, message: events.find(message => message.id === 7), text };
  }
  let message; try { message = JSON.parse(text); } catch {}
  return { response, message, text };
}
const toolText = result => result.message?.result?.content?.filter(item => item.type === 'text').map(item => item.text).join('\n');

test('R2 recovery encrypts the live named slots and authenticated activity refreshes later versions', { timeout: 30000 }, async t => {
  const app = await mirror(t, 'read-key-recovery');
  const archive = '__context_anywhere/read-keys-v1.json';
  const endpoint = '/admin/read-keys/sync';
  const slot17 = 'synthetic-read-password-slot17';
  const other = 'synthetic-unrelated-api-key';
  const bindings = (version, overrides = {}) => ({
    MIRROR_READ_KEY_17: slot17, MIRROR_READ_KEY_017: other, MIRROR_READ_KEY_1: other, SOME_API_KEY: other,
    CF_VERSION_METADATA: { id: 'version-' + version, timestamp: new Date(Date.UTC(2026, 0, version)).toISOString() }, ...overrides,
  });
  const call = (route, token, init = {}) => app.request(route, { ...init, headers: { ...init.headers, ...(token ? { Authorization: 'Bearer ' + token } : {}) } });
  const trigger = (nonce, credential) => call(endpoint, credential, { method: 'POST', headers: nonce ? { 'X-Context-Anywhere-Challenge': nonce } : {} });
  await app.setBindings(bindings(1));
  const storeChallenge = async data => (await app.mf.getR2Bucket('AI_MIRROR')).put(archive, JSON.stringify(data));
  assert.equal((await (await call('/health', slot17)).json()).readKeySlot, 17);
  assert.equal((await call('/health', other)).status, 401);
  assert.equal((await call('/note', slot17, { method: 'PUT', body: '{}' })).status, 403);
  const { tokens } = await authorize(app, slot17);
  const nonce = randomBytes(32).toString('base64url');
  const nonceHash = createHash('sha256').update(nonce).digest('hex');
  const pair = await webcrypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey']);
  const publicKey = Buffer.from(await webcrypto.subtle.exportKey('raw', pair.publicKey)).toString('base64url');
  const challenge = { version: 1, state: 'challenge', publicKey, nonceHash, expiresAt: Date.now() + 120000 };
  await storeChallenge({ ...challenge, workerVersionId: 'version-2' });
  assert.equal((await trigger(nonce)).status, 409);
  await storeChallenge(challenge);
  assert.equal((await trigger(null, slot17)).status, 403);
  assert.equal((await trigger(null, tokens.access_token)).status, 403);
  assert.equal((await trigger(randomBytes(32).toString('base64url'))).status, 403);
  assert.equal((await app.request(endpoint)).status, 405);
  assert.deepEqual(await (await trigger(nonce)).json(), { ok: true });
  const inspect = async version => {
    const bucket = await app.mf.getR2Bucket('AI_MIRROR');
    for (let attempt = 0; attempt < 60; attempt++) {
      const object = await bucket.get(archive);
      const body = await object.text(), entry = JSON.parse(body);
      assert.ok(![writeKey, readKey, slot17, other].some(key => body.includes(key)));
      if (entry.state === 'ready' && entry.workerVersionId === 'version-' + version) {
        assert.equal(entry.recipientPublicKey, publicKey); assert.equal(entry.nonceHash, nonceHash);
        const sender = await webcrypto.subtle.importKey('raw', Buffer.from(entry.publicKey, 'base64url'), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
        const aes = await webcrypto.subtle.deriveKey({ name: 'ECDH', public: sender }, pair.privateKey, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
        const bytes = await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(entry.iv, 'base64url'),
          additionalData: Buffer.from('context-anywhere/read-keys/v1/' + nonceHash) }, aes, Buffer.from(entry.ciphertext, 'base64url'));
        return { payload: JSON.parse(Buffer.from(bytes)), etag: object.etag };
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.fail('Missing encrypted snapshot for version ' + version);
  };
  const first = await inspect(1);
  assert.deepEqual(first.payload, { version: 1, keys: [{ slot: 1, value: readKey }, { slot: 17, value: slot17 }] });
  assert.equal((await trigger(nonce)).status, 200);
  assert.equal((await inspect(1)).etag, first.etag);
  for (const route of ['/sync/manifest', '/search?q=read-keys', '/recent', '/assets?note=Inbox%2Ftest.md']) {
    const result = await call(route, slot17);
    assert.equal(result.status, 200); assert.ok(!(await result.text()).includes('__context_anywhere'));
  }
  for (const route of ['/' + archive, '/note?path=' + archive, '/asset?path=' + archive]) {
    assert.ok((await call(route, writeKey)).status >= 400);
  }
  for (const name of ['get_note', 'read_attachment']) {
    const denied = await rpc(app, tokens.access_token, 'tools/call', { name, arguments: { path: archive } });
    assert.equal(denied.message.result.isError, true);
  }
  const changed = 'synthetic-primary-from-dashboard';
  await app.setBindings(bindings(2, { MIRROR_READ_KEY: changed, MIRROR_READ_KEY_17: '', MIRROR_READ_KEY_51: readKey2 }));
  assert.equal((await call('/health', slot17)).status, 401);
  assert.equal((await rpc(app, tokens.access_token, 'tools/list')).response.status, 200);
  const second = await inspect(2);
  assert.deepEqual(second.payload.keys, [{ slot: 1, value: changed }, { slot: 51, value: readKey2 }]);
  await app.setBindings(bindings(1));
  assert.equal((await trigger(null, writeKey)).status, 409);
  assert.equal((await inspect(2)).etag, second.etag);
  await app.setBindings(bindings(3, { MIRROR_READ_KEY: '', MIRROR_READ_KEY_17: '' }));
  assert.equal((await call('/health', writeKey)).status, 200);
  assert.deepEqual((await inspect(3)).payload.keys, []);
  await storeChallenge({ ...challenge, nonceHash: createHash('sha256').update('different').digest('hex') });
  assert.equal((await trigger(null, writeKey)).status, 200);
});

test('Gemini-style confidential DCR, HTTPS callback and second read password read a mirrored note', async t => {
  const app = await mirror(t, 'gemini-connected-app');
  await app.setSecondary(readKey2);
  const saved = await app.request('/note', { method: 'PUT', headers: { Authorization: 'Bearer ' + writeKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: 'Inbox/gemini.md', content: 'LOCAL GEMINI FIXTURE', mtime: Date.now() }) });
  assert.equal(saved.status, 200);
  const { tokens } = await authorize(app, readKey2, { clientName: 'Gemini local fixture', confidential: true,
    redirectUri: 'https://oauth-redirect.googleusercontent.com/r/context-anywhere-local-test' });
  const read = await rpc(app, tokens.access_token, 'tools/call', { name: 'get_note', arguments: { path: 'Inbox/gemini.md' } });
  assert.equal(JSON.parse(toolText(read)).content, 'LOCAL GEMINI FIXTURE');
});

test('real Worker OAuth and MCP preserve isolation and reject dangerous requests', { timeout: 45000 }, async t => {
  const app = await mirror(t, 'security-mirror-one');
  const { client, tokens } = await authorize(app);
  const access = tokens.access_token;
  await t.test('adding and rotating the second read password preserves the first key and both OAuth grants', async () => {
    const probe = async (key, path = '/health', init = {}) => app.request(path, { ...init, headers: { Authorization: 'Bearer ' + key } });
    assert.equal((await probe(readKey2)).status, 401);
    await app.setSecondary(writeKey);
    assert.equal((await probe(writeKey, '/note', { method: 'PUT', body: '{}' })).status, 401);
    await app.setSecondary(readKey2);
    for (const [slot, key] of [[1, readKey], [2, readKey2]]) {
      assert.equal((await (await probe(key)).json()).readKeySlot, slot);
      assert.equal((await probe(key, '/note', { method: 'PUT', body: '{}' })).status, 403);
    }
    const second = await authorize(app, readKey2);
    await app.setSecondary('synthetic-replacement-second-password');
    assert.equal((await probe(readKey2)).status, 401);
    assert.equal((await probe(readKey)).status, 200);
    assert.equal((await probe('synthetic-replacement-second-password')).status, 200);
    assert.equal((await rpc(app, second.tokens.access_token, 'tools/list')).response.status, 200);
    assert.equal((await rpc(app, access, 'tools/list')).response.status, 200);
  });
  for (const [name, content] of [['alpha', 'ONLY ALPHA RESPONSE'], ['beta', 'ONLY BETA RESPONSE']]) {
    const saved = await app.request('/note', { method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + writeKey },
      body: JSON.stringify({ path: 'Inbox/' + name + '.md', content, mtime: Date.now() }),
    });
    assert.equal(saved.status, 200);
  }

  await t.test('ordinary clients initialize and see only the read-only tools', async () => {
    const init = await rpc(app, access, 'initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'acceptance', version: '1' } });
    assert.equal(init.response.status, 200, init.text);
    assert.equal(init.message.result.serverInfo.name, 'Context Anywhere');
    const listed = await rpc(app, access, 'tools/list');
    assert.equal(listed.response.status, 200, listed.text);
    assert.deepEqual(listed.message.result.tools.map(tool => tool.name).sort(),
      ['get_note', 'list_note_attachments', 'read_attachment', 'recent_notes', 'search_notes']);
    assert.ok(listed.message.result.tools.every(tool => tool.annotations.readOnlyHint === true));
  });

  await t.test('the official client can negotiate and read a note with the upgraded server', async () => {
    const sdkClient = new Client({ name: 'official-client-acceptance', version: '1' });
    const transport = new StreamableHTTPClientTransport(new URL('/mcp', app.origin), {
      requestInit: { headers: { Authorization: 'Bearer ' + access } },
    });
    try {
      await sdkClient.connect(transport);
      const result = await sdkClient.callTool({ name: 'get_note', arguments: { path: 'Inbox/alpha.md' } });
      assert.equal(JSON.parse(result.content[0].text).content, 'ONLY ALPHA RESPONSE');
    } finally { await sdkClient.close(); }
  });

  await t.test('concurrent requests sharing a JSON-RPC id never exchange responses', async () => {
    const replies = await Promise.all(Array.from({ length: 16 }, (_, i) => {
      const name = i % 2 ? 'beta' : 'alpha';
      return rpc(app, access, 'tools/call', { name: 'get_note', arguments: { path: 'Inbox/' + name + '.md' } })
        .then(result => ({ name, result }));
    }));
    for (const { name, result } of replies) {
      assert.equal(result.response.status, 200, result.text);
      assert.equal(result.message.id, 7);
      const note = JSON.parse(toolText(result));
      assert.equal(note.path, 'Inbox/' + name + '.md');
      assert.equal(note.content, 'ONLY ' + name.toUpperCase() + ' RESPONSE');
    }
  });

  await t.test('malformed, oversized and over-complex input is rejected; valid requests still work', async () => {
    for (const version of ['2025-11-25', '2026-07-28']) {
      const oversized = await app.request('/mcp', { method: 'POST',
        headers: { Authorization: 'Bearer ' + access, 'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': version },
        body: JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/call',
          params: { name: 'get_note', arguments: { path: 'x'.repeat(70 * 1024) } } }),
      });
      assert.equal(oversized.status, 413);
      // The runtime may close the connection after rejecting an unread body.
      await oversized.body?.cancel();
    }
    const streamedBody = new TextEncoder().encode(JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/list', padding: 'x'.repeat(70 * 1024) }));
    const chunked = await app.request('/mcp', { method: 'POST', duplex: 'half',
      headers: { Authorization: 'Bearer ' + access, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: new ReadableStream({ start(controller) {
        for (let offset = 0; offset < streamedBody.length; offset += 4096) controller.enqueue(streamedBody.subarray(offset, offset + 4096));
        controller.close();
      } }),
    });
    assert.equal(chunked.status, 413, 'the byte limit must also work without Content-Length');
    await chunked.body?.cancel();
    const complex = await rpc(app, access, 'tools/call', { name: 'get_note',
      arguments: { path: 'Inbox/alpha.md', unexpected: Array.from({ length: 256 }, () => ({ extra: true })) } });
    assert.equal(complex.message.result.isError, true, complex.text);
    assert.match(toolText(complex), /maximum of 128 elements/);
    const invalid = await app.request('/mcp', { method: 'POST',
      headers: { Authorization: 'Bearer ' + access, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: '{' });
    assert.equal(invalid.status, 400);
    const good = await rpc(app, access, 'tools/call', { name: 'get_note', arguments: { path: 'Inbox/beta.md' } });
    assert.equal(JSON.parse(toolText(good)).content, 'ONLY BETA RESPONSE');
  });

  await t.test('credentials, paths and browser origins cannot bypass the read boundary', async () => {
    for (const badToken of [readKey, writeKey, 'foreign-access-token', '']) {
      assert.equal((await rpc(app, badToken, 'tools/list')).response.status, 401);
    }
    assert.equal((await rpc(app, access, 'tools/list', undefined, { Origin: 'https://attacker.invalid' })).response.status, 403);
    for (const target of ['../Private/secret.md', '.obsidian/plugins/ai-bridge/data.json']) {
      const denied = await rpc(app, access, 'tools/call', { name: 'get_note', arguments: { path: target } });
      assert.equal(denied.message.result.isError, true);
    }
    const write = await rpc(app, access, 'tools/call', { name: 'delete_note', arguments: { path: 'Inbox/alpha.md' } });
    assert.ok(write.message.error || write.message.result?.isError);
  });

  await t.test('another mirror cannot use this mirrors otherwise-valid OAuth access token', async () => {
    const other = await mirror(t, 'security-mirror-two');
    const denied = await rpc(other, access, 'tools/list');
    assert.equal(denied.response.status, 401);
  });

  await t.test('the stored grant refreshes and retains read-only access', async () => {
    const refreshed = await app.request('/oauth/token', { method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: client.client_id }),
    });
    assert.equal(refreshed.status, 200, await refreshed.clone().text());
    const renewed = await refreshed.json();
    assert.equal((await rpc(app, renewed.access_token, 'tools/list')).response.status, 200);
    const foreignClient = (await authorize(app)).client.client_id;
    const denied = await app.request('/oauth/token', { method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: renewed.refresh_token, client_id: foreignClient }),
    });
    assert.ok(denied.status >= 400, 'a refresh token must be bound to its original client');
  });

  await t.test('authorization-code replay is rejected and revokes the compromised grant', async () => {
    const fresh = await authorize(app);
    assert.equal((await rpc(app, fresh.tokens.access_token, 'tools/list')).response.status, 200);
    assert.ok((await fresh.replayCode()).status >= 400);
    assert.equal((await rpc(app, fresh.tokens.access_token, 'tools/list')).response.status, 401);
  });
});
