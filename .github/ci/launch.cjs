// A JavaScript Action is needed for GitHub to supply its artifact runtime token.
// The runner's Node only spawns the verified runtime; it loads no dependencies,
// opens no network connection and processes no compressed or remote input.
const { spawnSync } = require('node:child_process');
const { isAbsolute, join } = require('node:path');
const node = process.env.CI_NODE;
if (!node || !isAbsolute(node)) throw new Error('CI_NODE must point to the verified Node runtime');
const result = spawnSync(node, [join(__dirname, 'run.mjs')], { stdio: 'inherit', env: process.env });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
