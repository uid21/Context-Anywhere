import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';

export function powershell(script, input = '') {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = ''; child.stdout.on('data', chunk => output += chunk);
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(output.trim()) : reject(new Error('Windows 本地操作失败，请检查目录权限。')));
    child.stdin.end(input);
  });
}

export async function protect(value, decrypt = false) {
  if (process.platform !== 'win32') throw new Error('安装器的凭证保存功能仅支持 Windows。');
  const script = `Add-Type -AssemblyName System.Security
  $setupInput = [Console]::In.ReadToEnd()
  $setupBytes = [Convert]::FromBase64String($setupInput)
  $setupResult = [Security.Cryptography.ProtectedData]::${decrypt ? 'Unprotect' : 'Protect'}($setupBytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
  [Console]::Write([Convert]::ToBase64String($setupResult))`;
  return Buffer.from(await powershell(script, value.toString('base64')), 'base64');
}

export class Store {
  constructor(directory) { this.directory = directory; this.file = path.join(directory, 'deployment.dpapi'); }
  async load() {
    try { return JSON.parse((await protect(await readFile(this.file), true)).toString('utf8')); }
    catch (error) { if (error.code === 'ENOENT') return null; throw new Error('无法读取之前的安装记录，请使用原 Windows 账号运行。'); }
  }
  async save(value) {
    await mkdir(this.directory, { recursive: true });
    const encrypted = await protect(Buffer.from(JSON.stringify(value)));
    await writeFile(`${this.file}.tmp`, encrypted, { mode: 0o600 });
    await rename(`${this.file}.tmp`, this.file);
  }
}
