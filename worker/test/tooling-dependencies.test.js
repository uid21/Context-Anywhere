import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire, Module } from 'node:module';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { secureMiniflare, securedMiniflareHash, externalizeMiniflareAddresses } from '../scripts/secure-miniflare.mjs';
import { sha256 } from '../scripts/secure-wrangler.mjs';

const require = createRequire(import.meta.url);
const entry = secureMiniflare();
const source = readFileSync(entry, 'utf8');
const probe = new Module(entry);
probe.filename = entry;
probe.paths = Module._nodeModulePaths(path.dirname(entry));
probe._compile(source + '\nmodule.exports.securityProbe = { address: require_ip_address(), socks: require_socksclient() };', entry);
const { address, socks } = probe.exports.securityProbe;

test('Miniflare executes the fixed address implementation and repair fails on unreviewed bytes', () => {
  assert.equal(sha256(source), securedMiniflareHash);
  assert.equal(address, require('ip-address'));
  assert.equal(source.includes('ip-address@9.0.5'), false);
  assert.equal(secureMiniflare({ apply: true }), entry);
  assert.throws(() => externalizeMiniflareAddresses('unexpected'), /Unrecognized/);
  assert.equal(new address.Address6('a00::1').isInSubnet(new address.Address4('10.0.0.0/8')), false);
  assert.equal(new address.Address4('10.0.0.1').isInSubnet(new address.Address6('::/0')), false);
  assert.equal(new address.Address4('10.0.0.1').isInSubnet(new address.Address4('10.0.0.0/8')), true);
  for (const value of ['x'.repeat(100_000), 'a:'.repeat(50_000)]) {
    assert.throws(() => new address.Address6(value), error => error.message.length < 1000 && String(error.parseMessage).length < 1000);
  }
});

test('Miniflare SOCKS code still negotiates IPv4 targets and decodes IPv6 replies after replacement', { timeout: 10000 }, async t => {
  const sockets = new Set();
  let target;
  const server = createServer(socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    let phase = 0, buffered = Buffer.alloc(0);
    socket.on('data', chunk => {
      buffered = Buffer.concat([buffered, chunk]);
      if (phase === 0 && buffered.length >= 3) {
        assert.equal(buffered[0], 5);
        buffered = buffered.subarray(2 + buffered[1]); phase = 1;
        socket.write(Buffer.from([5, 0]));
      }
      if (phase === 1 && buffered.length >= 10) {
        assert.equal(buffered[3], 1);
        target = [...buffered.subarray(4, 8)].join('.');
        const reply = Buffer.alloc(22);
        reply.set([5, 0, 0, 4]); reply[19] = 1; reply.writeUInt16BE(443, 20);
        socket.write(reply); phase = 2;
      }
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); });
  const connected = await socks.SocksClient.createConnection({ command: 'connect',
    proxy: { host: '127.0.0.1', port: server.address().port, type: 5 },
    destination: { host: '192.0.2.123', port: 443 }, timeout: 5000 });
  connected.socket.destroy();
  assert.equal(target, '192.0.2.123');
  assert.equal(connected.remoteHost.port, 443);
  assert.equal(new address.Address6(connected.remoteHost.host).correctForm(), '::1');
});

test('Miniflare resolves and loads the fixed native image decoder, including SVG and AVIF', async () => {
  const mfRequire = createRequire(entry);
  const sharp = mfRequire('sharp');
  assert.equal(sharp.versions.sharp, '0.35.5');
  const png = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="red"/></svg>')).png().toBuffer();
  assert.equal((await sharp(png).metadata()).width, 2);
  const avif = await sharp(png).avif().toBuffer();
  assert.equal((await sharp(avif).png().metadata()).width, 2);
  await assert.rejects(sharp(Buffer.from('<svg broken')).png().toBuffer());
  assert.equal((await sharp(png).metadata()).height, 2);
});
