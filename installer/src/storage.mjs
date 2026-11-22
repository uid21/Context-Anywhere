import { SetupError } from './language.mjs';
import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { copyFile, mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

export function powershell(script, input = '') {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = ''; child.stdout.on('data', chunk => output += chunk);
    child.stderr?.resume();
    child.stdin.on?.('error', reject);
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(output.trim()) : reject(new SetupError("Windows 本地操作失败，请检查目录权限。", "The local Windows operation failed. Check the folder permissions.")));
    child.stdin.end(input);
  });
}

export async function protect(value, decrypt = false) {
  if (process.platform !== 'win32') throw new SetupError("向导的凭证保存功能仅支持 Windows。", "Saving setup credentials is only supported on Windows.");
  const script = `$ErrorActionPreference = 'Stop'
  Add-Type -AssemblyName System.Security
  $setupInput = [Console]::In.ReadToEnd()
  $setupBytes = [Convert]::FromBase64String($setupInput)
  $setupResult = [Security.Cryptography.ProtectedData]::${decrypt ? 'Unprotect' : 'Protect'}($setupBytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
  [Console]::Write([Convert]::ToBase64String($setupResult))`;
  const bytes = Buffer.from(await powershell(script, value.toString('base64')), 'base64');
  if (!bytes.length) throw new SetupError("Windows 未返回受保护的凭据。", "Windows returned no protected credentials.");
  return bytes;
}

export class UnreadableRecord extends SetupError {
  constructor() { super("当前 Windows 账号无法打开本机记录，可登录 Cloudflare 找回部署。", "This Windows account cannot open the local record. Sign in to Cloudflare to recover the deployment."); }
}

export class Store {
  constructor(directory) { this.directory = directory; this.file = path.join(directory, 'deployment.dpapi'); }
  async load() {
    let bytes;
    try { bytes = await readFile(this.file); }
    catch (error) { if (error.code === 'ENOENT') return null; throw new SetupError("无法访问安装记录，请检查目录权限后重试。", "Cannot access the setup record. Check folder permissions and retry."); }
    try {
      const state = JSON.parse((await protect(bytes, true)).toString('utf8'));
      if (!state?.id || !state.secrets?.write) throw new UnreadableRecord();
      return state;
    } catch { this.unreadable = true; throw new UnreadableRecord(); }
  }
  async save(value, { replaceUnreadable = false } = {}) {
    if (this.unreadable && !replaceUnreadable) throw new UnreadableRecord();
    await mkdir(this.directory, { recursive: true });
    const encrypted = await protect(Buffer.from(JSON.stringify(value)));
    const temp = `${this.file}.${randomUUID()}.tmp`;
    try {
      await writeFile(temp, encrypted, { mode: 0o600, flag: 'wx' });
      if (this.unreadable) await copyFile(this.file, `${this.file}.${randomUUID()}.bak`, constants.COPYFILE_EXCL);
      await rename(temp, this.file);
      this.unreadable = false;
    } finally { await rm(temp, { force: true }); }
  }
}
