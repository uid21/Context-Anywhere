import { chromium } from 'playwright-core';
import { access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';

export async function chromePath() {
  const candidates = [process.env.LOCALAPPDATA, process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)']]
    .filter(Boolean).map(root => path.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'));
  for (const candidate of candidates) { if (await access(candidate).then(() => true).catch(() => false)) return candidate; }
  throw new Error('未找到 Chrome，请先安装 Google Chrome。');
}

export function openChrome(executable, args) {
  const child = spawn(executable, args, { windowsHide: true, detached: true, stdio: 'ignore' });
  child.on('error', () => {}); child.unref(); return child;
}

export function debugEndpoint(port) {
  if (!Number.isInteger(Number(port)) || Number(port) < 1024 || Number(port) > 65535) throw new Error('DevTools 端口需为 1024–65535 的数字。');
  return `http://127.0.0.1:${Number(port)}`;
}

async function unusedPort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}

export async function startDebugChrome(directory, previousPort) {
  if (previousPort) {
    let browser;
    try {
      browser = await chromium.connectOverCDP(debugEndpoint(previousPort), { timeout: 1500 });
      const session = await browser.newBrowserCDPSession();
      const details = await session.send('Browser.getBrowserCommandLine');
      const normalize = value => value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
      const matches = details.arguments.some(arg => arg.startsWith('--user-data-dir=') && normalize(arg.slice(16)) === normalize(directory));
      if (matches) {
        const page = await browser.contexts()[0].newPage(); await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded' });
        return previousPort;
      }
    } catch {} finally { if (browser) await browser.close(); }
  }
  const port = await unusedPort();
  openChrome(await chromePath(), [`--user-data-dir=${directory}`, `--remote-debugging-port=${port}`,
    '--remote-debugging-address=127.0.0.1', '--enable-automation', '--no-first-run', 'https://chatgpt.com/']);
  for (let attempt = 0; attempt < 12; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 500));
    try { const response = await fetch(`${debugEndpoint(port)}/json/version`, { signal: AbortSignal.timeout(1000) }); if (response.ok) return port; } catch {}
  }
  throw new Error('Chrome DevTools 没有启动。关闭安装器专用的 Chrome 窗口后重试；不要关闭你的日常 Chrome。');
}

const CREATE = /^(创建|创建应用|创建插件|创建为插件|Create|Create app|Create as a plugin|Add custom MCP server)$/i;
const SCAN = /^(Scan tools|扫描工具)$/i;

async function clickVisible(page, role, name, timeout = 4000) {
  const candidates = page.getByRole(role, { name });
  const count = await candidates.count();
  for (let i = 0; i < count; i++) {
    const item = candidates.nth(i);
    if (await item.isVisible() && await item.isEnabled()) { await item.click({ timeout }); return true; }
  }
  return false;
}

async function fillByLabel(page, patterns, value) {
  for (const pattern of patterns) {
    for (const locator of [page.getByLabel(pattern), page.getByPlaceholder(pattern)]) {
      const count = await locator.count();
      for (let i = 0; i < count; i++) if (await locator.nth(i).isVisible()) { await locator.nth(i).fill(value); return true; }
    }
  }
  return false;
}

export async function connectChatGPT({ port, workerUrl, readPassword, appName, progress }) {
  if (!/^https:\/\/[a-z0-9.-]+\.workers\.dev$/.test(workerUrl)) throw new Error('请先完成此安装的 Worker 部署。');
  if (!appName?.trim() || appName.length > 80) throw new Error('ChatGPT 插件名称需为 1–80 个字符。');
  let browser;
  try { browser = await chromium.connectOverCDP(debugEndpoint(port), { timeout: 8000 }); }
  catch { throw new Error('无法连接 Chrome DevTools。可打开安装器专用 Chrome 并登录，或填写已经开放的本机调试端口。默认 Chrome profile 无法直接开放该端口。'); }
  try {
    const context = browser.contexts()[0];
    const existing = context.pages().filter(page => { try { return new URL(page.url()).hostname === 'chatgpt.com'; } catch { return false; } });
    // Resume our own tab, preserving a login/create form opened on the previous attempt.
    const marker = `context-anywhere-setup:${workerUrl}`;
    let page;
    for (const candidate of existing) {
      if (await candidate.evaluate(() => window.name).catch(() => '') === marker) { page = candidate; break; }
    }
    const resumed = Boolean(page);
    if (!page) page = await context.newPage();
    progress(existing.length ? '复用 Chrome 当前的 ChatGPT 登录' : '打开 ChatGPT，请确认已登录');
    if (!resumed) {
      await page.goto('https://chatgpt.com/#settings/Connectors', { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.evaluate(value => { window.name = value; }, marker);
    }
    if (await page.getByRole('button', { name: /^(Log in|登录)$/i }).isVisible().catch(() => false)) {
      return { connected: false, waiting: true, message: '请在打开的 Chrome 中登录 ChatGPT，再点“继续自动接入”。' };
    }
    await page.waitForTimeout(1500);
    // Support both the Apps settings UI and the newer Plugins hub.
    const openForm = page.getByRole('dialog').filter({ has: page.getByRole('textbox') }).last();
    if (resumed && await openForm.isVisible().catch(() => false)) {
      progress('继续填写当前 MCP 创建窗口');
    } else if (await clickVisible(page, 'button', CREATE) || await clickVisible(page, 'link', /Add custom MCP server|创建应用|创建插件/i)) {
      progress('填写 ChatGPT MCP 连接');
    } else {
      const advanced = await clickVisible(page, 'button', /Advanced settings|高级设置/i);
      if (advanced) {
        const toggle = page.getByRole('switch', { name: /Developer mode|开发者模式/i });
        if (await toggle.count() && !(await toggle.isChecked())) await toggle.click();
        await clickVisible(page, 'button', /^(Back|返回)$/i);
      }
      if (!(await clickVisible(page, 'button', CREATE))) {
        await page.goto('https://chatgpt.com/plugins', { waitUntil: 'domcontentloaded', timeout: 60_000 });
        if (!(await clickVisible(page, 'button', /Add|添加|\+/i))) {
          return { connected: false, waiting: true, message: '未找到创建入口。请在该 Chrome 中打开 ChatGPT 的创建应用 / 添加自定义 MCP 窗口，再点继续。账号需支持自定义 MCP。', port };
        }
        await clickVisible(page, 'button', /Add custom MCP server|添加自定义 MCP/i);
        await clickVisible(page, 'menuitem', /Add custom MCP server|添加自定义 MCP/i);
      }
    }
    const dialog = page.getByRole('dialog').last();
    const surface = await dialog.isVisible().catch(() => false) ? dialog : page;
    const nameOK = await fillByLabel(surface, [/^(Name|名称|应用名称|插件名称)$/i], appName);
    const urlOK = await fillByLabel(surface, [/MCP.*(URL|地址)|Server URL|服务器.*(URL|地址)|URL/i], `${workerUrl}/mcp`);
    if (!nameOK || !urlOK) return { connected: false, waiting: true, message: 'ChatGPT 页面字段已变化。请手动打开创建窗口，用向导提供的 MCP 地址填写，或更新安装器。' };
    await fillByLabel(surface, [/Description|描述/i], '只读搜索和读取此 Obsidian 知识库的独立 AI 镜像。');
    const authentication = surface.getByRole('combobox');
    for (let index = 0; index < await authentication.count(); index++) {
      const item = authentication.nth(index);
      if (!await item.isVisible()) continue;
      if (await item.evaluate(el => el.tagName === 'SELECT')) await item.selectOption({ label: 'OAuth' }).catch(() => {});
      else { await item.click(); await clickVisible(page, 'option', /^OAuth$/i); }
    }
    const risk = surface.getByRole('checkbox', { name: /I understand|我了解|我理解|风险/i });
    if (await risk.count()) await risk.first().check();
    const beforePages = new Set(context.pages());
    const scanning = await clickVisible(surface, 'button', SCAN);
    if (!scanning && !await clickVisible(surface, 'button', CREATE)) return { connected: false, waiting: true, message: '请检查 ChatGPT 的 OAuth 和风险提示选项，再点继续。' };
    progress('等待只读 OAuth 授权');
    let authorized = false;
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      const consent = context.pages().find(candidate => { try { return new URL(candidate.url()).origin === workerUrl; } catch { return false; } });
      if (consent && await consent.locator('#password').isVisible().catch(() => false)) {
        await consent.locator('#password').fill(readPassword);
        await consent.locator('button[value="allow"]').click(); authorized = true;
      }
      if (scanning && authorized) await clickVisible(page.getByRole('dialog').last(), 'button', CREATE);
      // Positive UI evidence is required; a callback alone is not an installation.
      const success = page.getByText(/Connected|已连接|连接成功|Installed|已安装/i);
      const ownName = page.getByText(appName, { exact: true }).first();
      const ownEndpoint = page.getByText(`${workerUrl}/mcp`, { exact: false }).first();
      if (authorized && await success.first().isVisible().catch(() => false)
          && await ownName.isVisible().catch(() => false) && await ownEndpoint.isVisible().catch(() => false)
          && !await page.getByRole('dialog').getByRole('button', { name: CREATE }).isVisible().catch(() => false)) {
        progress('ChatGPT 已显示此插件已连接'); return { connected: true, appName };
      }
      const install = page.getByRole('button', { name: /^(Install|安装|Connect|连接)$/i });
      if (authorized && await install.isVisible().catch(() => false)) await install.click();
      // Never fill a password on another site's page, even if its form resembles ours.
      if (context.pages().some(candidate => !beforePages.has(candidate) && /oauth.*error|access_denied/i.test(candidate.url()))) break;
      await page.waitForTimeout(1500);
    }
    return { connected: false, waiting: true, message: authorized ? '只读授权已提交，但未确认插件已安装。请检查 ChatGPT 创建窗口的结果；向导不会把未确认的连接报成成功。' : '未出现此 Worker 的授权页。请检查 ChatGPT 创建窗口或账号权限。' };
  } finally { await browser.close(); } // Disconnect only; does not close Chrome.
}
