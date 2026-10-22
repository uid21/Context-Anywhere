import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { currentLanguage, withLanguage, SetupError } from '../src/language.mjs';
import { Cloudflare, deploy, login, resourceNames } from '../src/cloudflare.mjs';
import { settingsFrom, inspectVault, prepareImport } from '../src/obsidian.mjs';
import { verifyMirror, openBrowser } from '../src/browser.mjs';
import { Store } from '../src/storage.mjs';

const chinese = /[\u4e00-\u9fff]/u;
const options = { deviceName: 'Test device', includePrefixes: 'Inbox' };
const fixture = () => ({ id: 'ab12cd34', accountId: 'a'.repeat(32), names: resourceNames('my-notes', 'ab12cd34'), secrets: { write: 'fixture-write', read: 'fixture-read' } });

test('language contexts stay independent across async work and cached errors can be translated', async () => {
  const message = new SetupError('请先完成部署。', 'Complete the deployment first.');
  await Promise.all(['en', 'zh-CN'].map(language => withLanguage(language, async () => {
    await new Promise(resolve => setTimeout(resolve, language === 'en' ? 10 : 1));
    assert.equal(currentLanguage(), language);
    assert.equal(message.message, language === 'en' ? 'Complete the deployment first.' : '请先完成部署。');
  })));
});

test('English validation and connection failures contain actionable English messages', async () => withLanguage('en', async () => {
  for (const [changes, expected] of [
    [{ deviceName: '' }, /device name/],
    [{ includePrefixes: '../Private' }, /relative to the vault/],
    [{ includePrefixes: '' }, /Sync all Markdown/],
    [{ autoSyncIntervalMinutes: 0 }, /1–1440 minutes/],
    [{ maxAttachmentMiB: 9 }, /1–8 MiB/],
    [{ debounceMs: 1 }, /250–10000 milliseconds/],
  ]) assert.throws(() => settingsFrom({ ...options, ...changes }), error => expected.test(error.message) && !chinese.test(error.message));
  assert.throws(() => resourceNames('bad name', 'ab12cd34'), /deployment name/);
  await assert.rejects(inspectVault(''), /Obsidian vault/);
  await assert.rejects(prepareImport({ enabled: true, localImportSupported: false }, {}), /Update the plugin/);
  await assert.rejects(openBrowser('http://example.test'), /HTTPS/);
  await assert.rejects(verifyMirror('https://fixture.workers.dev', async () => new Response('missing', { status: 404 })), /Return to Deploy and import/);
}));

test('Cloudflare errors retain codes and redact provider details when a cached error changes language', async () => {
  const cf = new Cloudflare('private-token', async () => Response.json({ success: false, errors: [{ code: 10041, message: 'private-token provider-detail' }] }, { status: 400 }));
  const error = await withLanguage('zh-CN', () => cf.request('/accounts/fixture/workers/scripts/fixture').catch(error => error));
  withLanguage('en', () => {
    assert.match(error.message, /HTTP 400 \/ 10041/);
    assert.match(error.message, /KV storage bound to the Worker is missing/);
    assert.doesNotMatch(error.message, chinese);
    assert.doesNotMatch(error.message, /private-token|provider-detail/);
  });
  withLanguage('zh-CN', () => assert.match(error.message, /KV 存储不存在/));
});

test('mock deployment reports every progress stage and success in the selected language', async () => {
  for (const language of ['en', 'zh-CN']) await withLanguage(language, async () => {
    const state = fixture(); state.bucketCreated = true; state.kvId = 'deleted-kv';
    const messages = [];
    const cf = { request: async (url, method = 'GET') => {
      if (url.endsWith('/workers/subdomain')) return { subdomain: 'fixture' };
      if (method === 'GET') return null;
      if (url.endsWith('/namespaces')) return { id: 'new-kv' };
      return {};
    } };
    await deploy({ cf, state, module: 'export default {}', save: async () => {}, progress: message => messages.push(message), fetcher: async url => Response.json(url.endsWith('/health') ? { service: 'obsidian-ai-mirror' } : { authorization_endpoint: 'https://fixture/authorize' }) });
    assert.equal(state.deployed, true);
    assert.equal(messages.length, 8);
    if (language === 'en') {
      assert.equal(messages.at(-1), 'Deployment complete');
      assert.ok(messages.some(message => /Recreating missing cloud resources: R2 notes bucket, OAuth KV/.test(message)));
      assert.doesNotMatch(messages.join('\n'), chinese);
    } else assert.equal(messages.at(-1), '部署成功');
  });
});

test('OAuth browser callbacks keep their starting language while error objects can follow the UI', async t => {
  const realFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = realFetch; });
  globalThis.fetch = async url => {
    if (String(url) === 'https://dash.cloudflare.com/oauth2/token') return Response.json({ access_token: 'fixture-token' });
    if (String(url).startsWith('http://localhost:8976/')) return realFetch(url);
    throw new Error('Unexpected network request in OAuth language test');
  };
  let receivedToken;
  const success = await withLanguage('en', () => login(async token => { receivedToken = token; }));
  t.after(() => success.close());
  const state = new URL(success.url).searchParams.get('state');
  const response = await withLanguage('zh-CN', () => fetch(`http://localhost:8976/oauth/callback?state=${state}&code=fixture`));
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.equal(receivedToken, 'fixture-token');
  assert.match(html, /lang="en"/);
  assert.match(html, /Cloudflare is connected/);
  assert.doesNotMatch(html, chinese);
  let loginError;
  const canceled = await withLanguage('zh-CN', () => login(async (_token, error) => { loginError = error; }));
  t.after(() => canceled.close());
  const canceledState = new URL(canceled.url).searchParams.get('state');
  const failure = await withLanguage('en', () => fetch(`http://localhost:8976/oauth/callback?state=${canceledState}&error=access_denied`));
  assert.match(await failure.text(), /登录未完成/);
  withLanguage('en', () => assert.match(loginError.message, /authorization was canceled/));
});

test('the real private RPC pipe switches language and exports a localized secret-free manual', { skip: process.platform !== 'win32' }, async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ca-language-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const state = { ...fixture(), deployed: true, workerUrl: 'https://fixture.workers.dev' };
  await new Store(directory).save(state);
  const installer = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const child = spawn(process.execPath, [path.join(installer, 'src', 'bridge.mjs')], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, CA_SETUP_DATA_DIR: directory, CA_SETUP_LANGUAGE: 'en' } });
  const exited = once(child, 'exit');
  const pending = new Map(); let sequence = 0, stderr = '';
  child.stderr.on('data', data => { stderr += data; });
  createInterface({ input: child.stdout }).on('line', line => {
    const message = JSON.parse(line);
    if (message.progress || message.event) return;
    pending.get(message.id)?.(message);
  });
  t.after(async () => { child.stdin.end(); await exited; });
  async function call(action, language, input = {}) {
    const id = ++sequence;
    let timer;
    try {
      return await new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error('RPC timed out: '+stderr)), 5000);
        pending.set(id, resolve);
        child.stdin.write(JSON.stringify({ id, action, language, input })+'\n');
      });
    } finally { clearTimeout(timer); pending.delete(id); }
  }
  const english = await call('manual', 'en');
  assert.match(english.result.text, /MCP URL: https:\/\/fixture.workers.dev\/mcp/);
  assert.doesNotMatch(english.result.text, chinese);
  assert.equal(english.result.readPassword, state.secrets.read);
  assert.match((await call('manual', 'zh-CN')).result.text, /MCP 地址/);
  const file = path.join(directory, 'connection.txt');
  assert.equal((await call('export', 'en', { path: file })).result.saved, true);
  const saved = await readFile(file, 'utf8');
  assert.match(saved, /Authentication: OAuth/);
  assert.doesNotMatch(saved, chinese);
  assert.doesNotMatch(saved, /fixture-read|fixture-write/);
  assert.match((await call('unknown', 'en')).error, /Unknown operation/);
  assert.match((await call('unknown', 'zh-CN')).error, /未知操作/);
  assert.match((await call('vault.inspect', 'en', { path: '' })).error, /full path to your Obsidian vault/);
});
