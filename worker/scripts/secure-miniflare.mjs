import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { parse } from 'acorn';

const require = createRequire(import.meta.url);
const originalHash = '58ca83056cf67838add064edcbfd1d654ed204527b8eb01307ba208d7e59fa20';
export const securedMiniflareHash = '5016a78c84ff4a1b13fe5a7d0ccdc0a8ebc5ccf70aebaece8daa9248d28a43d4';
const hash = source => createHash('sha256').update(source).digest('hex');
const modulePath = /^\.\.\/\.\.\/node_modules\/\.pnpm\/ip-address@9\.0\.5\/node_modules\/ip-address\/(.+)$/;

// Miniflare's SOCKS helpers only use Address4/6 conversion APIs retained in v10.
// Replace all nine embedded modules rather than patching individual IP checks.
export function externalizeMiniflareAddresses(source) {
  if (hash(source) !== originalHash) throw new Error('Unrecognized Miniflare bundle; review before repairing.');
  const edits = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'CallExpression' && node.callee?.name === '__commonJS') {
      const props = node.arguments[0]?.type === 'ObjectExpression' && node.arguments[0].properties;
      const match = props?.length === 1 && modulePath.exec(props[0].key?.value);
      if (match) {
        const target = match[1] === 'dist/ip-address.js' ? 'ip-address' : 'ip-address/' + match[1];
        require.resolve(target);
        edits.push({ start: node.start, end: node.end, text: '() => require(' + JSON.stringify(target) + ')' });
        return;
      }
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  }
  visit(parse(source, { ecmaVersion: 'latest', sourceType: 'script' }));
  if (edits.length !== 9) throw new Error('Unexpected Miniflare embedded address-library layout.');
  for (const edit of edits.sort((a, b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  source = source.replace(/^\/\/ \.\.\/\.\.\/node_modules\/\.pnpm\/ip-address@9\.0\.5\/node_modules\/ip-address\/[^\r\n]+\r?\n/gm, '');
  if (source.includes('ip-address@9.0.5')) throw new Error('Old Miniflare address implementation remains.');
  return source;
}

export function secureMiniflare({ apply = false } = {}) {
  if (require('miniflare/package.json').version !== '5.20260828.0-alpha' ||
      require('ip-address/package.json').version !== '10.7.4') throw new Error('Miniflare/address versions changed; review or retire the externalization.');
  const file = require.resolve('miniflare');
  const source = readFileSync(file, 'utf8');
  if (hash(source) === securedMiniflareHash) return file;
  if (!apply) throw new Error('Miniflare security repair missing or modified. Run npm --prefix worker run security:repair.');
  const fixed = externalizeMiniflareAddresses(source);
  if (hash(fixed) !== securedMiniflareHash) throw new Error('Miniflare repair checksum mismatch.');
  writeFileSync(file, fixed);
  return file;
}
