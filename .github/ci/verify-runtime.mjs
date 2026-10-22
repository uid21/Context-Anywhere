import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
// @sigstore/core 3.2.1 fixes GHSA-jfc7-64v2-mr8c. The 2 -> 3 major
// change only drops Node 18; these jobs run Node 22. The signing regression
// test exercises the official DSSE builder with this scoped override.
export function verifyRuntime() {
  const pinned = readFileSync(join(here, '../../.node-version'), 'utf8').trim();
  assert.equal(process.versions.node, pinned, 'CI must run with the checksum-verified pinned Node');
  assert.equal(process.versions.undici, '6.29.1', 'Unexpected built-in HTTP client; review the runtime pin');
  const lock = JSON.parse(readFileSync(join(here, 'package-lock.json'), 'utf8'));
  const copies = Object.entries(lock.packages).filter(([key]) => key.endsWith('/node_modules/undici') || key === 'node_modules/undici');
  assert.ok(copies.length, 'No locked Undici package found');
  for (const [key, value] of copies) {
    assert.equal(value.version, '6.29.1', 'Unreviewed HTTP client in lockfile: ' + key);
    assert.equal(JSON.parse(readFileSync(join(here, key, 'package.json'), 'utf8')).version, value.version);
  }
  // These SDKs ship normal modules, not opaque dist bundles. Verify their real
  // resolution paths, including the nested http-client used by @actions/github.
  const clients = ['@actions/http-client', '@actions/github'];
  for (const id of clients) {
    const sdkRequire = createRequire(import.meta.resolve(id));
    assert.equal(sdkRequire('undici/package.json').version, '6.29.1', id + ' loaded an unsafe Undici');
  }
  const githubRequire = createRequire(import.meta.resolve('@actions/github'));
  const httpClientPackage = githubRequire.resolve.paths('@actions/http-client')
    .map(base => join(base, '@actions/http-client/package.json')).find(existsSync);
  assert.ok(httpClientPackage, 'Missing nested GitHub HTTP client');
  const nestedRequire = createRequire(httpClientPackage);
  assert.equal(nestedRequire('undici/package.json').version, '6.29.1');
  return { node: process.versions.node, builtinUndici: process.versions.undici, sdkUndici: '6.29.1', copies: copies.length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) console.log(verifyRuntime());
