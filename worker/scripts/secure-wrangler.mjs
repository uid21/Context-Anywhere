import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parse } from 'acorn';
import { assertSafeRuntime } from '../../scripts/check-runtime.mjs';
import { secureMiniflare } from './secure-miniflare.mjs';

const require = createRequire(import.meta.url);
export const upstreamHash = 'ba531de00d3c21615f3d523df4e83a94d487de68d77225aa703463b6a2979406';
// Regenerated only after reviewing the pinned upstream CLI and the transformation.
export const securedHash = '93ef87498b2a5a6d8fd2fb9b96cade3d7316cd2635932defa1e600f75c73e50b';
const modulePath = /^\.\.\/\.\.\/node_modules\/\.pnpm\/undici@7\.29\.0\/node_modules\/undici\/(.+)$/;
export const sha256 = source => createHash('sha256').update(source).digest('hex');

export function externalizeUndici(source) {
  if (sha256(source) !== upstreamHash) throw new Error('Unrecognized Wrangler CLI bytes; review the upstream release before changing this repair.');
  const replacements = [];
  const entries = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'CallExpression' && /^__commonJS(?:\$\d+)?$/.test(node.callee?.name)) {
      const properties = node.arguments[0]?.type === 'ObjectExpression' && node.arguments[0].properties;
      const match = properties?.length === 1 && modulePath.exec(properties[0].key?.value);
      if (match) {
        const subpath = match[1];
        const target = subpath === 'index.js' ? 'undici' : `undici/${subpath}`;
        require.resolve(target); // A removed/renamed module in the fixed package is a hard failure.
        replacements.push({ start: node.start, end: node.end, text: `() => require(${JSON.stringify(target)})` });
        if (subpath === 'index.js') entries.push(node.callee.name);
        return;
      }
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  }
  visit(parse(source, { ecmaVersion: 'latest', sourceType: 'script' }));
  if (replacements.length !== 336 || entries.length !== 3) throw new Error('Unexpected bundled Undici layout.');
  for (const edit of replacements.sort((a, b) => b.start - a.start)) {
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  }
  // Remove obsolete source labels, not third-party licenses or Sentry's Undici integration.
  source = source.replace(/^\/\/ \.\.\/\.\.\/node_modules\/\.pnpm\/undici@7\.29\.0\/node_modules\/undici\/[^\r\n]+\r?\n/gm, '');
  if (source.includes('undici@7.29.0') || /assert\w*\(err.code !== "ERR_TLS_CERT_ALTNAME_INVALID"\)/.test(source)) {
    throw new Error('Old bundled Undici code remains.');
  }
  return source;
}

export function secureWrangler({ apply = false } = {}) {
  assertSafeRuntime();
  secureMiniflare({ apply });
  if (require('wrangler/package.json').version !== '4.127.1' || require('undici/package.json').version !== '7.30.1') {
    throw new Error('Wrangler/Undici versions changed; review or retire the temporary externalization.');
  }
  const cli = require.resolve('wrangler');
  const source = readFileSync(cli, 'utf8');
  if (sha256(source) === securedHash) return cli;
  if (!apply) throw new Error('Wrangler security repair missing or modified. Run npm --prefix worker run security:repair.');
  const fixed = externalizeUndici(source);
  if (sha256(fixed) !== securedHash) throw new Error('Wrangler security transformation checksum mismatch.');
  writeFileSync(cli, fixed);
  return cli;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  secureWrangler({ apply: process.argv.includes('--apply') });
  console.log('Wrangler 4.127.1: all 3 bundled Undici copies externalized to locked Undici 7.30.1.');
  console.log('Miniflare: bundled IP address parsing externalized to locked ip-address 10.7.4.');
}
