import { build } from '../../node_modules/esbuild/lib/main.js';
import { spawn } from 'node:child_process';
import { mkdir, cp, copyFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.dirname(directory);
function run(command, args, cwd) { return new Promise((resolve, reject) => {
  const process = spawn(command, args, { cwd, stdio: 'inherit', windowsHide: true });
  process.on('error', reject); process.on('close', code => code === 0 ? resolve() : reject(new Error(`Build exited ${code}`)));
}); }
await mkdir(path.join(directory, 'dist', 'app'), { recursive: true });
await mkdir(path.join(directory, 'dist', 'payload'), { recursive: true });
await mkdir(path.join(directory, 'payload'), { recursive: true });
await run(process.execPath, [path.join(root, 'worker', 'node_modules', 'wrangler', 'bin', 'wrangler.js'), 'deploy', '--dry-run', '--minify', '--config', 'wrangler.example.toml', '--outdir', path.join(directory, 'payload')], path.join(root, 'worker'));
await build({ entryPoints: [path.join(directory, 'src', 'bridge.mjs')], outfile: path.join(directory, 'dist', 'app', 'bridge.mjs'),
  bundle: true, platform: 'node', format: 'esm', target: 'node22', external: ['playwright-core'],
  banner: { js: "import { createRequire as setupCreateRequire } from 'node:module'; const require = setupCreateRequire(import.meta.url);" } });
await copyFile(path.join(directory, 'payload', 'index.js'), path.join(directory, 'dist', 'payload', 'index.js'));
await cp(path.join(directory, 'node_modules', 'playwright-core'), path.join(directory, 'dist', 'app', 'node_modules', 'playwright-core'), { recursive: true });
await copyFile(path.join(root, 'LICENSE'), path.join(directory, 'dist', 'LICENSE.txt'));
await copyFile(path.join(directory, 'README.md'), path.join(directory, 'dist', 'README.txt'));
const playwrightLicense = await readFile(path.join(directory, 'node_modules', 'playwright-core', 'LICENSE'), 'utf8');
await writeFile(path.join(directory, 'dist', 'THIRD-PARTY-NOTICES.txt'), `Context Anywhere Setup includes Playwright Core (Microsoft, Apache-2.0) and Node.js (see runtime/LICENSE). Worker dependencies retain their bundled license notices.\n\n${playwrightLicense}`);
process.stdout.write('Native backend and public Worker payload built. Run package:windows to compile the Windows executable.\n');
