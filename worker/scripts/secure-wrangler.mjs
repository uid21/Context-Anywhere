import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { assertSafeRuntime } from '../../scripts/check-runtime.mjs';

const require = createRequire(import.meta.url);

function verifyPublishedEntry(name, version, sha256) {
  const entry = require.resolve(name);
  assert.equal(require(`${name}/package.json`).version, version);
  assert.equal(createHash('sha256').update(readFileSync(entry)).digest('hex'), sha256,
    `${name} entry differs from the reviewed npm package. Run npm --prefix worker ci.`);
  return entry;
}

export function secureWrangler() {
  assertSafeRuntime();
  // Wrangler uses the external Undici release. Miniflare ships a fixed IP address parser.
  const cli = verifyPublishedEntry('wrangler', '4.166.0', '0d064b8bde1073900f1337aec71c76732007fe1408a2654dda99f9ffe51bd873');
  const miniflare = verifyPublishedEntry('miniflare', '5.20261119.0-beta', 'd231b99642a507865a336a5d175630e7c5c4ad5aeaec025e72927c4fe86ae195');
  const cliRequire = createRequire(cli);
  const miniflareRequire = createRequire(miniflare);
  assert.equal(cliRequire('undici/package.json').version, '7.30.2');
  assert.equal(miniflareRequire.resolve('undici'), cliRequire.resolve('undici'));
  return cli;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  secureWrangler();
  console.log('Verified published Wrangler and Miniflare entries and shared Undici 7.30.2.');
}
