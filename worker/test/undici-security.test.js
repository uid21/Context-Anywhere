import assert from 'node:assert/strict';
import { constants, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer as httpServer } from 'node:http';
import { createServer as httpsServer } from 'node:https';
import { createServer as netServer } from 'node:net';
import { createServer as tlsServer, checkServerIdentity } from 'node:tls';
import { resolve as resolveDns } from 'node:dns';
import Module, { createRequire } from 'node:module';
import { brotliCompressSync } from 'node:zlib';
import test from 'node:test';
import { assertSafeRuntime } from '../../scripts/check-runtime.mjs';
import { secureWrangler, securedHash, sha256, externalizeUndici } from '../scripts/secure-wrangler.mjs';

const require = createRequire(import.meta.url);
const miniflareRequire = createRequire(require.resolve('miniflare'));
const undici = miniflareRequire('undici');
const fixture = name => readFileSync(new URL('./fixtures/tls/' + name + '.pem', import.meta.url));
const matching = { key: fixture('matching-key'), cert: fixture('matching-cert') };
const wrongHost = { key: fixture('wrong-key'), cert: fixture('wrong-cert') };
const ca = fixture('ca');
const lookup = (hostname, options, callback) => options.all
  ? callback(null, [{ address: '127.0.0.1', family: 4 }]) : callback(null, '127.0.0.1', 4);

async function listen(t, server) {
  const sockets = new Set();
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(resolve));
  });
  return server.address().port;
}

test('all THREE actual Wrangler factories and Miniflare load the same fixed package', () => {
  const cli = secureWrangler();
  const source = readFileSync(cli, 'utf8');
  assert.equal(sha256(source), securedHash);
  assert.equal(source.includes('undici@7.29.0'), false);
  assert.equal(miniflareRequire('undici/package.json').version, '7.30.1');
  // Expose the installed CLI's existing factories only in memory, without launching its main.
  const probe = new Module(cli);
  probe.filename = cli;
  probe.paths = Module._nodeModulePaths(require('node:path').dirname(cli));
  probe._compile(source + '\nmodule.exports.securityCopies = [require_undici(), (init_dist14(), require_undici2()), (init_dist15(), require_undici3())];', cli);
  assert.equal(probe.exports.securityCopies.length, 3);
  for (const copy of probe.exports.securityCopies) assert.equal(copy, undici);
});

test('repair is idempotent and refuses unexpected bytes; obsolete runtimes fail closed', () => {
  assert.equal(secureWrangler({ apply: true }), secureWrangler());
  assert.throws(() => externalizeUndici('unrecognized bundle'), /Unrecognized/);
  for (const version of ['22.23.3', '24.22.0', '26.12.0', '20.19.0']) assert.throws(() => assertSafeRuntime(version), /security runtime/);
  for (const version of ['22.23.4', '24.22.1', '26.12.1']) assert.doesNotThrow(() => assertSafeRuntime(version));
});

for (const [name, fetcher] of [['Node built-in fetch', fetch], ['Wrangler/Miniflare Undici', undici.fetch]]) {
  test(name + ': real HTTP rejects altered integrity, accepts correct Brotli JSON', { timeout: 10000 }, async t => {
    const trusted = '{"success":true,"result":{"id":"synthetic-account"}}';
    const digest = createHash('sha256').update(trusted).digest('base64');
    const port = await listen(t, httpServer((req, res) => {
      res.setHeader('Content-Encoding', 'br');
      res.end(brotliCompressSync(req.url === '/trusted' ? trusted : 'tampered response'));
    }));
    for (const token of ['sha256', 'SHA256', 'Sha256']) {
      await assert.rejects(fetcher('http://127.0.0.1:' + port + '/altered', { integrity: token + '-' + digest }),
        error => error.cause?.message === 'integrity mismatch');
      const response = await fetcher('http://127.0.0.1:' + port + '/trusted', { integrity: token + '-' + digest });
      assert.deepEqual(await response.json(), JSON.parse(trusted));
    }
  });

  test(name + ': excessive encodings plus premature close reject without process crash', { timeout: 10000 }, async t => {
    const port = await listen(t, netServer(socket => socket.once('data', () => socket.end(
      'HTTP/1.1 200 OK\r\nContent-Encoding: gzip, gzip, gzip, gzip, gzip, gzip\r\nContent-Length: 1\r\nConnection: close\r\n\r\n'))));
    await assert.rejects(async () => {
      const response = await fetcher('http://127.0.0.1:' + port);
      await response.text();
    });
    // Allow orphaned stream errors to surface in node:test.
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  test(name + ': malformed Brotli fails and a subsequent request still works', { timeout: 10000 }, async t => {
    const port = await listen(t, httpServer((req, res) => {
      if (req.url === '/bad') { res.setHeader('Content-Encoding', 'br'); res.end(Buffer.from([0xff, 0xff, 0xff, 0xff])); }
      else res.end('still alive');
    }));
    await assert.rejects(async () => (await fetcher('http://127.0.0.1:' + port + '/bad')).text());
    assert.equal(await (await fetcher('http://127.0.0.1:' + port + '/ok')).text(), 'still alive');
  });
}

for (const protocol of ['http/1.1', 'h2']) {
  test('Wrangler/Miniflare: malicious TLS 1.2 certificate swap over ' + protocol + ' rejects, stays alive', { timeout: 10000 }, async t => {
    let renegotiated;
    const started = new Promise(resolve => { renegotiated = resolve; });
    const server = tlsServer({ ...matching, minVersion: 'TLSv1.2', maxVersion: 'TLSv1.2',
      secureOptions: constants.SSL_OP_NO_SESSION_RESUMPTION_ON_RENEGOTIATION, ALPNProtocols: [protocol] }, socket => {
      socket.on('error', () => {});
      socket.once('data', () => setTimeout(() => {
        socket.setKeyCert(wrongHost);
        renegotiated(socket.renegotiate({ requestCert: false, rejectUnauthorized: false }, () => {}));
      }, 50));
    });
    const port = await listen(t, server);
    const client = new undici.Client('https://localhost:' + port, { allowH2: protocol === 'h2',
      connect: { ca, lookup, minVersion: 'TLSv1.2', maxVersion: 'TLSv1.2' } });
    t.after(() => client.destroy());
    const rejected = assert.rejects(client.request({ path: '/', method: 'GET' }), { code: 'ERR_TLS_CERT_ALTNAME_INVALID' });
    assert.equal(await started, true);
    await rejected;
    await assert.rejects(client.request({ path: '/', method: 'GET' }), { code: 'ERR_TLS_CERT_ALTNAME_INVALID' });
  });
}

for (const option of ['tls', 'connect']) {
  test('Wrangler/Miniflare: custom certificate rejection survives Agent ' + option + ' options', { timeout: 10000 }, async t => {
    const port = await listen(t, httpsServer(matching, (req, res) => res.end('must not be accepted')));
    let checks = 0;
    const agent = new undici.Agent({ [option]: { ca, lookup, checkServerIdentity() { checks++; return new Error('rejected by security policy'); } } });
    t.after(() => agent.destroy());
    await assert.rejects(undici.request('https://localhost:' + port, { dispatcher: agent }), /rejected by security policy/);
    assert.equal(checks, 1);
  });
}

test('Node rejects NUL-containing DNS queries and non-canonical IP certificate identities', () => {
  assert.throws(() => resolveDns('localhost\0.attacker.invalid', () => {}), /null|invalid/i);
  for (const host of ['127.1', '0x7f000001', '2130706433']) {
    assert.ok(checkServerIdentity(host, { subjectaltname: 'DNS:' + host }), 'must reject ' + host);
  }
});
