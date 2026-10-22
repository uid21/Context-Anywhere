import { spawn } from 'node:child_process';
import { secureWrangler } from './secure-wrangler.mjs';

// All repository deployment/build commands use this checked entry point.
const cli = secureWrangler();
const child = spawn(process.execPath, ['--no-warnings', cli, ...process.argv.slice(2)], {
  stdio: 'inherit', windowsHide: true,
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
