import { powershell } from './storage.mjs';

export async function openBrowser(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') throw new Error('浏览器链接必须使用 HTTPS。');
  await powershell('$setupUrl = [Console]::In.ReadToEnd(); Start-Process -FilePath $setupUrl', parsed.href);
}

export async function verifyMirror(workerUrl, fetcher = fetch) {
  if (!/^https:\/\/[a-z0-9.-]+\.workers\.dev$/.test(workerUrl)) throw new Error('请先完成镜像部署。');
  try {
    const response = await fetcher(`${workerUrl}/.well-known/oauth-authorization-server`, { signal: AbortSignal.timeout(15_000), redirect: 'error' });
    const metadata = response.ok ? await response.json() : null;
    if (!metadata || ['authorization_endpoint', 'token_endpoint'].some(key => new URL(metadata[key]).origin !== workerUrl)) throw new Error('Unavailable mirror');
  } catch {
    throw new Error('镜像暂时无法连接。请回到“部署与导入”检查部署，再接入 AI。');
  }
}
