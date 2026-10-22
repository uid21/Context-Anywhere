import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// October 2026 security releases. Keep this separate from the reproducible build pin.
export function assertSafeRuntime(version = process.versions.node) {
  const [major, minor, patch] = version.split('.').map(Number);
  const minimum = { 22: [23, 4], 24: [22, 1], 26: [12, 1] }[major];
  if (!minimum || minor < minimum[0] || (minor === minimum[0] && patch < minimum[1])) {
    const pinned = readFileSync(new URL('../.node-version', import.meta.url), 'utf8').trim();
    throw new Error(`Node ${version} is not a reviewed security runtime. Use Node ${pinned} from .node-version (or patched Node 24.22.1 / 26.12.1 or later in those release lines).`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assertSafeRuntime();
  console.log(`Runtime: Node ${process.versions.node}; built-in Undici ${process.versions.undici}; ${process.execPath}`);
}
