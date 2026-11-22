import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createInterface } from 'node:readline';
import { mkdtemp, mkdir, readFile, writeFile, readdir, realpath, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from '../../worker/node_modules/miniflare/dist/src/index.js';
import { consumeSetupImport } from '../../src/setup-import.js';
import { Store } from '../src/storage.mjs';
import { resourceNames } from '../src/cloudflare.mjs';
import { RECOVERY_TITLE } from '../src/recovery.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const account = 'a'.repeat(32), oauthId = 'b'.repeat(32), recoveryId = 'c'.repeat(32);
const names = resourceNames('recovery-fixture', 'ab12cd34'), origin = `https://${names.worker}.fixture.workers.dev`;
const token = 'synthetic-recovery-upload-token', readPassword = 'synthetic-recovery-read-password';
const record = { kind: 'context-anywhere-recovery', version: 1, accountId: account, id: 'ab12cd34', label: 'recovery-fixture', names,
  kvId: oauthId, workerUrl: origin, secrets: { write: token, read: readPassword }, createdAt: '2026-11-05T00:00:00.000Z', updatedAt: '2026-11-05T00:00:00.000Z' };
const key = 'deployment:' + names.worker;

for (const unreadable of [false, true]) test(`a device with ${unreadable ? 'an unreadable receipt' : 'no receipt'} discovers, restores, imports and resumes`, { timeout: 60000 }, async t => {
  // The runner's TEMP may use an 8.3 alias. Model Obsidian opening the canonical
  // vault path returned by inspection, rather than a different spelling of it.
  const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), 'ca-recovery-')));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const vault = path.join(directory, 'New device vault'), plugin = path.join(vault, '.obsidian/plugins/ai-bridge');
  await mkdir(plugin, { recursive: true });
  await writeFile(path.join(plugin, 'manifest.json'), '{"id":"ai-bridge","version":"0.4.2"}');
  await writeFile(path.join(plugin, 'main.js'), '');
  await writeFile(path.join(vault, '.obsidian/community-plugins.json'), '["ai-bridge"]');
  const payload = process.env.CA_TEST_PAYLOAD || path.join(root, 'installer/payload/index.js');
  const objectKey='__context_anywhere/read-keys-v1.json', versionId='12345678-abcd-4321-abcd-123456789abc';
  const mf = new Miniflare(convertV4MiniflareOptions({ host: '127.0.0.1', port: 0, cf: false, workers: [{ name: names.worker, modules: true,
    scriptPath: payload, modulesRoot: path.dirname(payload), compatibilityDate: '2026-08-29',
    compatibilityFlags: ['nodejs_compat', 'global_fetch_strictly_public'], r2Buckets: ['AI_MIRROR'], kvNamespaces: ['OAUTH_KV'],
    bindings: { MIRROR_TOKEN: token, MIRROR_READ_KEY: readPassword, CF_VERSION_METADATA:{id:versionId,timestamp:new Date().toISOString()} } }] }));
  t.after(() => mf.dispose()); await mf.ready;
  let archived = JSON.stringify(record), wrongBindings = false;
  const privateValues=new Map(),bucket=await mf.getR2Bucket('AI_MIRROR');
  const managementCalls = [], mirrorCalls = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://fixture'), pathname = url.pathname;
    const parts = []; for await (const part of req) parts.push(part); const body = Buffer.concat(parts);
    try {
      if (pathname.startsWith('/client/v4/')) {
        managementCalls.push({ path: pathname, method: req.method });
        if (pathname.endsWith('/' + recoveryId + '/bulk') && req.method === 'PUT') {
          for(const item of JSON.parse(body)) {if(item.key===key)archived=item.value;else privateValues.set(item.key,item.value);}
          res.end(JSON.stringify({ success: true, result: {} })); return;
        }
        if(pathname.endsWith('/objects/'+objectKey)){
          if(req.method==='PUT'){await bucket.put(objectKey,body);res.end('{"success":true,"result":{}}');return;}
          const item=await bucket.get(objectKey);if(!item){res.writeHead(404).end('{}');return;}
          res.end(await item.text());return;
        }
        if (req.method !== 'GET') throw new Error('Recovery mutated cloud management');
        let result;
        if (pathname === '/client/v4/accounts') result = [{ id: account, name: 'Fixture account' }];
        else if (pathname.endsWith('/storage/kv/namespaces')) result = [{ id: recoveryId, title: RECOVERY_TITLE }];
        else if (pathname.endsWith('/keys')) result = url.searchParams.get('prefix')==='deployment:' ? [{ name: key, metadata: { kind: record.kind, updatedAt: record.updatedAt } }] : [];
        else if (pathname.includes('/values/')) {const name=decodeURIComponent(pathname.split('/values/')[1]);if(name===key)res.end(archived);else if(privateValues.has(name))res.end(privateValues.get(name));else res.writeHead(404).end('{}');return;}
        else if (pathname.endsWith('/deployments')) result={deployments:[{versions:[{percentage:100,version_id:versionId}]}]};
        else if (pathname.endsWith('/settings')) result = { tags: ['context-anywhere-setup:' + record.id], bindings: [
          { type: 'r2_bucket', name: 'AI_MIRROR', bucket_name: wrongBindings ? 'foreign-bucket' : names.bucket },
          { type: 'kv_namespace', name: 'OAUTH_KV', namespace_id: oauthId },{type:'version_metadata',name:'CF_VERSION_METADATA'}] };
        else if (pathname.endsWith('/workers/subdomain')) result = { subdomain: 'fixture' };
        else if (pathname.includes('/r2/buckets/')) result = { name: names.bucket };
        else if (pathname.endsWith('/' + oauthId)) result = { id: oauthId };
        else throw new Error('Unexpected management endpoint');
        res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ success: true, result, result_info: { cursor: '' } })); return;
      }
      mirrorCalls.push({ path: pathname, method: req.method, body: body.toString() });
      const response = await mf.dispatchFetch(origin + req.url, { method: req.method, headers: { ...req.headers, host: new URL(origin).host }, ...(body.length ? { body } : {}) });
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
    } catch { res.writeHead(500).end('Fixture failed'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const service = 'http://127.0.0.1:' + server.address().port;
  const preload = path.join(directory, 'routes.cjs');
  await writeFile(preload, `
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, options) => { const url = new URL(input);
 if (!['https://api.cloudflare.com', ${JSON.stringify(origin)}].includes(url.origin)) throw new Error('External network blocked');
 return originalFetch(${JSON.stringify(service)}+url.pathname+url.search,options); };
const cp=require('node:child_process'),originalSpawn=cp.spawn;
cp.spawn=(exe,args,options)=>{
 const script=args.includes('-EncodedCommand')?Buffer.from(args.at(-1),'base64').toString('utf16le'):'';
 if(!script.includes('Start-Process'))return originalSpawn(exe,args,options);
 const child=new(require('node:events').EventEmitter)();child.stdout=new(require('node:stream').PassThrough)();
 child.stdin={end(){setImmediate(()=>child.emit('close',0));}};return child;
};require('node:module').syncBuiltinESMExports();
`);
  const stateDir = path.join(directory, 'state');
  const receipt = path.join(stateDir, 'deployment.dpapi');
  const previousReceipt = Buffer.from('Synthetic record that DPAPI cannot decrypt');
  if (unreadable) { await mkdir(stateDir); await writeFile(receipt, previousReceipt); }
  const bridge = process.env.CA_TEST_BUNDLE ? path.join(process.env.CA_TEST_BUNDLE, 'app/bridge.mjs') : path.join(root, 'installer/src/bridge.mjs');
  const messages = [];
  function start(directory = stateDir) {
    const child = spawn(process.execPath, ['--require', preload, bridge], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, CA_SETUP_DATA_DIR: directory, CA_SETUP_LANGUAGE: 'en' } });
    let sequence = 0; const pending = new Map(), lines = createInterface({ input: child.stdout });
    lines.on('line', line => { const message = JSON.parse(line); if (message.progress || message.event) { messages.push(message); return; } pending.get(message.id)?.(message); });
    return { async call(action, input = {}) { let timer; const id = ++sequence;
      try { return await new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error('RPC timed out: ' + action)), 10000);
        pending.set(id, message => { messages.push(['manual','secret.get'].includes(action) ? message.state : message); resolve(message); });
        child.stdin.write(JSON.stringify({ id, action, input, language: 'en' })+'\n');
      }); }
      finally { clearTimeout(timer); pending.delete(id); }
    }, async close() { child.stdin.end(); if (child.exitCode === null) await new Promise(resolve => child.once('exit', resolve)); lines.close(); } };
  }
  let rpc = start(); t.after(() => rpc.close());
  const initial = (await rpc.call('state')).state;
  assert.equal(initial.deployed, false); assert.equal(initial.localRecordUnreadable, unreadable);
  assert.ok((await rpc.call('secret.get', { kind: 'write' })).error);
  assert.ok((await rpc.call('recovery.restore', { accountId: account, key })).error);
  assert.equal(managementCalls.length, 0);
  if (!unreadable) await rpc.call('vault.inspect', { path: vault });
  const before = await readFile(path.join(stateDir, 'deployment.dpapi'));
  assert.equal((await rpc.call('cloudflare.token', { token: 'synthetic-management-token' })).state.authenticated, true);
  assert.ok((await rpc.call('recovery.list', { accountId: 'd'.repeat(32) })).error);
  assert.equal((await rpc.call('recovery.list', { accountId: account })).state.recoveries.length, 1);
  assert.equal(managementCalls.some(c => c.path.includes('/values/')), false);
  wrongBindings = true;
  assert.ok((await rpc.call('recovery.restore', { accountId: account, key })).error);
  assert.equal(mirrorCalls.length, 0); assert.deepEqual(await readFile(path.join(stateDir, 'deployment.dpapi')), before);
  wrongBindings = false;
  archived = JSON.stringify({ ...record, secrets: { ...record.secrets, write: 'synthetic-stale-write-token' } });
  assert.ok((await rpc.call('recovery.restore', { accountId: account, key })).error);
  assert.deepEqual(await readFile(path.join(stateDir, 'deployment.dpapi')), before);
  archived = JSON.stringify(record);
  const restored = await rpc.call('recovery.restore', { accountId: account, key });
  assert.equal(restored.result?.restored, true, restored.error); assert.equal(restored.state.recovered, true);
  if (unreadable) {
    const backups = (await readdir(stateDir)).filter(file => file.endsWith('.bak'));
    assert.equal(backups.length, 1); assert.deepEqual(await readFile(path.join(stateDir, backups[0])), previousReceipt);
    assert.equal(restored.state.localRecordUnreadable, false); assert.equal(restored.state.vault, undefined);
    assert.equal((await rpc.call('manual')).result.url, origin+'/mcp');
    assert.equal((await rpc.call('vault.inspect', { path: vault })).result.path, vault);
  }
  assert.equal(restored.state.settings, undefined);
  assert.ok((await rpc.call('deploy', {})).error); assert.ok((await rpc.call('obsidian.import', {})).error);
  const options = { deviceName: 'Brand new device', includePrefixes: 'Inbox', pluginConfirmed: true, bidirectionalEnabled: true };
  assert.equal((await rpc.call('recovery.configure', options)).result?.configured, true);
  assert.equal((await rpc.call('obsidian.import')).result?.opened, true);
  const staleHandoff = (await readdir(plugin)).find(file => /^setup-.*\.json$/.test(file));
  assert.equal((await rpc.call('recovery.configure', { ...options, includePrefixes: 'Inbox/selected.md' })).result.configured, true);
  await assert.rejects(readFile(path.join(plugin, staleHandoff)), /ENOENT/);
  assert.equal((await rpc.call('recovery.configure', options)).result.configured, true);
  assert.equal((await rpc.call('obsidian.import')).result?.opened, true);
  const handoff = (await readdir(plugin)).find(file => /^setup-.*\.json$/.test(file));
  const adapter = { getBasePath: () => vault, read: file => readFile(path.join(vault, file), 'utf8'), remove: file => rm(path.join(vault, file)) };
  const settings = await consumeSetupImport(adapter, '.obsidian', { v: '1', id: handoff.slice(6, -5), path: vault });
  assert.equal(settings.token, token); assert.equal(settings.workerUrl, origin); assert.deepEqual(settings.includePrefixes, ['Inbox']);
  await writeFile(path.join(plugin, 'data.json'), JSON.stringify(settings));
  assert.equal((await rpc.call('obsidian.verify')).result.imported, true);
  assert.equal((await rpc.call('recovery.configure', options)).result.configured, true);
  const other = path.join(directory, 'Other vault'), otherPlugin = path.join(other, '.obsidian/plugins/ai-bridge');
  await mkdir(otherPlugin, { recursive: true });
  await writeFile(path.join(otherPlugin, 'manifest.json'), '{"id":"ai-bridge","version":"0.4.2"}');
  await writeFile(path.join(otherPlugin, 'main.js'), '');
  await writeFile(path.join(other, '.obsidian/community-plugins.json'), '["ai-bridge"]');
  assert.match((await rpc.call('vault.inspect', { path: other })).error, /different vault/);
  assert.match((await rpc.call('vault.inspect', { path: other, replaceMissingVault: true })).error, /different vault/);
  assert.equal((await rpc.call('obsidian.verify')).result.imported, true);
  assert.equal(JSON.stringify(messages).includes(token), false); assert.equal(JSON.stringify(messages).includes(readPassword), false);
  assert.deepEqual((await bucket.list()).objects.map(item=>item.key),[objectKey]);
  assert.equal(managementCalls.every(c => c.method === 'GET' || c.method==='PUT'&&(c.path.endsWith('/objects/'+objectKey)||c.path.endsWith('/'+recoveryId+'/bulk'))),true);
  assert.equal(mirrorCalls.filter(c => c.method === 'PUT').every(c => c.path === '/note' && c.body === '{}'), true);
  await rpc.close(); rpc = start();
  const resumed = await rpc.call('state');
  assert.equal(resumed.state.authenticated, false); assert.equal(resumed.state.recovered, true); assert.equal(resumed.state.imported, true);
  assert.equal((await rpc.call('secret.get', { kind: 'write' })).result.value, token);
  assert.equal((await rpc.call('secret.get', { kind: 'read' })).result.value, readPassword);
  assert.deepEqual((await new Store(stateDir).load()).secrets, record.secrets);
  assert.equal((await readFile(path.join(stateDir, 'deployment.dpapi'))).includes(Buffer.from(token)), false);
  if (!unreadable) {
    await rpc.close();
    const freshDir = path.join(directory, 'blank-device');
    rpc = start(freshDir);
    archived = JSON.stringify({ ...record, secrets: { ...record.secrets, read: 'synthetic-old-cloud-password' } });
    await rpc.call('cloudflare.token', { token: 'synthetic-management-token' });
    await rpc.call('recovery.list', { accountId: account });
    const fixed = await rpc.call('recovery.restore', { accountId: account, key });
    assert.equal(fixed.result?.restored, true, fixed.error); assert.equal(fixed.state.recoverySaved, true, fixed.result?.warning);
    assert.deepEqual((await new Store(freshDir).load()).secrets, record.secrets);
    assert.deepEqual(JSON.parse(archived).secrets, {write:token});
  }
  if (unreadable) {
    await rpc.close(); const moved = path.join(directory, 'Moved vault'); await rename(vault, moved); rpc = start();
    assert.equal((await rpc.call('state')).state.missingVault, true);
    assert.match((await rpc.call('vault.inspect', { path: moved })).error, /different vault/);
    const relocated = await rpc.call('vault.inspect', { path: moved, replaceMissingVault: true });
    assert.equal(relocated.result?.path, moved, relocated.error); assert.equal(relocated.state.missingVault, false);
    assert.equal(relocated.state.settings, undefined); assert.equal(relocated.state.imported, false);
    assert.ok((await rpc.call('obsidian.import')).error);
    assert.equal((await rpc.call('recovery.configure', options)).result?.configured, true);
  }
});
