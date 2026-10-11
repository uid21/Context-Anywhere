import { build } from '../../node_modules/esbuild/lib/main.js';
import { spawn } from 'node:child_process';
import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.dirname(directory);
const version = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8')).version;
const output = path.join(directory, 'dist', `Context-Anywhere-${version}-win-x64`);
function run(command, args, cwd) { return new Promise((resolve, reject) => {
  const process = spawn(command, args, { cwd, stdio: 'inherit', windowsHide: true });
  process.on('error', reject); process.on('close', code => code === 0 ? resolve() : reject(new Error(`Build exited ${code}`)));
}); }
await mkdir(path.join(output, 'app'), { recursive: true });
await mkdir(path.join(output, 'payload'), { recursive: true });
await mkdir(path.join(directory, 'payload'), { recursive: true });
await run(process.execPath, [path.join(root, 'worker', 'node_modules', 'wrangler', 'bin', 'wrangler.js'), 'deploy', '--dry-run', '--minify', '--config', 'wrangler.example.toml', '--outdir', path.join(directory, 'payload')], path.join(root, 'worker'));
await build({ entryPoints: [path.join(directory, 'src', 'bridge.mjs')], outfile: path.join(output, 'app', 'bridge.mjs'),
  bundle: true, platform: 'node', format: 'esm', target: 'node22',
  banner: { js: "import { createRequire as setupCreateRequire } from 'node:module'; const require = setupCreateRequire(import.meta.url);" } });
await copyFile(path.join(directory, 'payload', 'index.js'), path.join(output, 'payload', 'index.js'));
await copyFile(path.join(root, 'LICENSE'), path.join(output, 'LICENSE.txt'));
await copyFile(path.join(directory, 'README.md'), path.join(output, 'README.txt'));
await mkdir(path.join(output, 'obsidian-plugin'), { recursive: true });
for (const name of ['main.js', 'manifest.json', 'styles.css']) await copyFile(path.join(root, name), path.join(output, 'obsidian-plugin', name));
await writeFile(path.join(output, 'THIRD-PARTY-NOTICES.txt'), 'Includes Node.js (see runtime/LICENSE). Worker dependencies retain their bundled license notices.\n');
process.stdout.write('Native backend and public Worker payload built. Run package:windows to compile the Windows executable.\n');
