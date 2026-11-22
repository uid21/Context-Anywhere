import test from 'node:test';
import assert from 'node:assert/strict';
import { Cloudflare, deploy, resourceNames, validBearer } from '../src/cloudflare.mjs';
import { RECOVERY_TITLE, discoverRecoveries, manualRecord, writeRecovery, readRecovery, verifyRecovery, validateRecord } from '../src/recovery.mjs';
import { updateReadKey } from '../src/read-keys.mjs';
import { syncReadKeys } from '../src/key-snapshot.mjs';
import { keyCloud } from './key-cloud.fixture.mjs';

const account = 'a'.repeat(32), recoveryId = 'c'.repeat(32), oauthId = 'b'.repeat(32);
test('provider bearer token accepts RFC 6750 punctuation and terminal padding',()=>{
  assert.ok(validBearer('fixture-1234567890._~+/=='));
  for(const invalid of ['fixture with space12345678','fixture-1234567890=bad','fixture-1234567890\r\nBad','x'.repeat(16385)]) assert.equal(validBearer(invalid),false);
});
function fixture() {
  return { kind: 'context-anywhere-recovery', version: 1, id: 'ab12cd34', label: 'my-context', accountId: account,
    names: resourceNames('my-context', 'ab12cd34'), kvId: oauthId, workerUrl: 'https://my-context-ab12cd34.fixture.workers.dev',
    secrets: { write: 'synthetic-upload-credential', read: 'synthetic-reading-password' },
    createdAt: '2026-11-05T00:00:00.000Z', updatedAt: '2026-11-05T00:00:00.000Z' };
}
function controlPlane(record = fixture()) {
  const values = new Map(), calls = [], spaces = [], bindings = [
    { type: 'r2_bucket', name: 'AI_MIRROR', bucket_name: record.names.bucket },
    { type: 'kv_namespace', name: 'OAUTH_KV', namespace_id: record.kvId },
  ];
  const cf = new Cloudflare('synthetic-management-token', async (url, options) => {
    assert.equal(options.redirect, 'error');
    const path = new URL(url).pathname, query = new URL(url).searchParams;
    calls.push({ path, method: options.method, body: options.body });
    let result;
    if (path.endsWith('/storage/kv/namespaces')) {
      if (options.method === 'POST') { result = { id: recoveryId, title: JSON.parse(options.body).title }; spaces.push(result); }
      else result = spaces;
    } else if (path.endsWith('/bulk')) { for (const item of JSON.parse(options.body)) values.set(item.key, item); result = {}; }
    else if (path.endsWith('/keys')) {
      result = [...values.values()].filter(v => v.key.startsWith(query.get('prefix'))).map(v => ({ name: v.key, metadata: v.metadata }));
      return Response.json({ success: true, result, result_info: { cursor: '' } });
    } else if (path.includes('/values/')) {
      const item = values.get(decodeURIComponent(path.split('/values/')[1]));
      return item ? new Response(item.value) : new Response('{}', { status: 404 });
    } else if (path.endsWith('/settings')) result = { tags: ['context-anywhere-setup:' + record.id], bindings };
    else if (path.includes('/r2/buckets/')) result = { name: record.names.bucket };
    else if (path.endsWith('/' + oauthId)) result = { id: oauthId };
    else if (path.endsWith('/workers/subdomain')) result = { subdomain: 'fixture' };
    else throw new Error('Unexpected fixture endpoint');
    return Response.json({ success: true, result });
  });
  return { cf, values, calls, spaces, bindings };
}
function mirror(record, calls = []) {
  return async (url, options) => {
    assert.equal(new URL(url).origin, record.workerUrl); assert.equal(options.redirect, 'error');
    calls.push({ url, options });
    if (url.endsWith('/.well-known/oauth-authorization-server')) return Response.json({ authorization_endpoint: record.workerUrl + '/authorize', token_endpoint: record.workerUrl + '/token' });
    const token = options.headers.Authorization;
    if (!Object.values(record.secrets).some(secret => token === 'Bearer ' + secret)) return Response.json({}, { status: 401 });
    if (url.endsWith('/health')) return Response.json({ service: 'obsidian-ai-mirror', readKeySlots: 2,
      ...(token === 'Bearer ' + record.secrets.write ? {} : { readKeySlot: token === 'Bearer ' + record.secrets.read ? 1 : 2 }) });
    assert.equal(options.body, '{}');
    return token === 'Bearer ' + record.secrets.write ? Response.json({ error: 'invalid note' }, { status: 400 }) : Response.json({ error: 'forbidden' }, { status: 403 });
  };
}

test('first deployment recovery is stored in a separate private namespace and discovery never reads credentials', async () => {
  const record = fixture(), f = controlPlane(record);
  assert.deepEqual(await discoverRecoveries(f.cf, account), { namespaceId: null, records: [] });
  assert.equal(f.calls.some(c => c.method !== 'GET'), false);
  const receipt = await writeRecovery(f.cf, { ...record, vault: { path: 'private-local-path' }, settings: { includePrefixes: ['Private'] }, imported: true }, mirror(record));
  assert.equal(receipt.recoverySaved, true); assert.equal(receipt.recoveryNamespaceId, recoveryId);
  assert.equal(f.spaces[0].title, RECOVERY_TITLE);
  const saved = [...f.values.values()][0];
  assert.equal(saved.value.includes('private-local-path'), false); assert.equal(saved.value.includes('includePrefixes'), false);
  assert.equal(JSON.stringify(saved.metadata).includes(record.secrets.write), false);
  const before = f.calls.length;
  const discovery = await discoverRecoveries(f.cf, account);
  assert.equal(discovery.records.length, 1); assert.equal(JSON.stringify(discovery).includes(record.secrets.write), false);
  assert.equal(f.calls.slice(before).some(c => c.path.includes('/values/')), false);
  assert.deepEqual((await readRecovery(f.cf, account, recoveryId, discovery.records[0].key)).secrets, {write:record.secrets.write});
});

test('recovery verifies management identity before sending either credential, leaves notes and cloud resources unchanged', async () => {
  const record = fixture(), f = controlPlane(record), calls = [];
  await verifyRecovery(f.cf, record, recoveryId, mirror(record, calls));
  assert.equal(f.calls.every(c => c.method === 'GET'), true);
  assert.equal(calls.filter(c => c.options.method === 'PUT').length, 1);
  assert.equal(calls.filter(c => c.options.method === 'PUT').every(c => c.options.body === '{}'), true);
  f.bindings.push({ type: 'kv_namespace', name: 'LEAK', namespace_id: recoveryId });
  let network = false;
  await assert.rejects(verifyRecovery(f.cf, record, recoveryId, async () => { network = true; }), /资源与恢复记录不一致/);
  assert.equal(network, false);
});

test('wrong account, malicious URLs, swapped resources, malformed records and missing values fail without recovery', async () => {
  const record = fixture();
  for (const mutation of [
    { version: 3 }, { accountId: 'd'.repeat(32) }, { workerUrl: 'https://attacker.workers.dev' },
    { workerUrl: record.workerUrl + '/path' }, { workerUrl: record.workerUrl + '?token=secret' },
    { kvId: '../other' }, { secrets: { write: '' } },
    { names: { ...record.names, bucket: 'other-notes' } }, { label: '../invalid' },
  ]) assert.throws(() => validateRecord({ ...record, ...mutation }, account));
  const f = controlPlane(record);
  await assert.rejects(readRecovery(f.cf, account, recoveryId, 'deployment:' + record.names.worker), /尚未同步或已移除/);
  f.values.set('deployment:' + record.names.worker, { value: '{invalid' });
  await assert.rejects(readRecovery(f.cf, account, recoveryId, 'deployment:' + record.names.worker), /恢复记录无效/);
  f.spaces.push({ id: recoveryId, title: RECOVERY_TITLE }, { id: 'd'.repeat(32), title: RECOVERY_TITLE });
  await assert.rejects(discoverRecoveries(f.cf, account), /重名恢复空间/);
});

test('stale credentials and network/redirect errors are sanitized; no rotation or fallback', async () => {
  const record = fixture(), f = controlPlane(record);
  for (const fetcher of [async () => Response.json({}, { status: 401 }), async () => { throw new Error(record.secrets.write); }]) {
    await assert.rejects(verifyRecovery(f.cf, record, recoveryId, fetcher), error => /凭据已失效/.test(error.message) && !error.message.includes(record.secrets.write));
  }
  assert.equal(f.calls.every(c => c.method === 'GET'), true);
});

test('legacy backup resolves the actual recovery namespace and refuses to write into any Worker-bound KV', async () => {
  const record = fixture(), f = controlPlane(record);
  f.spaces.push({ id: recoveryId, title: RECOVERY_TITLE });
  f.bindings.push({ type: 'kv_namespace', name: 'UNEXPECTED_EXTRA', namespace_id: recoveryId });
  await assert.rejects(writeRecovery(f.cf, record), /恢复空间已绑定/);
  assert.equal(f.values.size, 0);
  assert.equal(f.calls.some(call => call.method === 'PUT'), false);
});

test('key discovery follows cursors and rejects a repeated cursor rather than looping', async () => {
  let page = 0;
  const cf = { list: async () => [{ id: recoveryId, title: RECOVERY_TITLE }], request: async url => {
    page++; assert.equal(new URL('https://fixture' + url).searchParams.get('cursor'), page === 1 ? null : 'next');
    return { result: [{ name: 'deployment:' + fixture().names.worker }], result_info: { cursor: page === 1 ? 'next' : '' } };
  } };
  assert.equal((await discoverRecoveries(cf, account)).records.length, 2); assert.equal(page, 2);
  cf.request = async () => ({ result: [], result_info: { cursor: 'repeated' } });
  await assert.rejects(discoverRecoveries(cf, account), /恢复记录无效/);
});

test('a failed recovery write preserves the healthy mirror and generated keys for a focused retry', async () => {
  const state = fixture(); delete state.kind; delete state.version; delete state.kvId;
  const originalSecrets = { ...state.secrets }; let backups = 0;
  const cf = { request: async (url, method) => url.endsWith('/workers/subdomain') ? { subdomain: 'fixture' }
    : url.endsWith('/settings') ? null : url.endsWith('/storage/kv/namespaces') && method === 'POST' ? { id: oauthId } : {} };
  await assert.rejects(deploy({ cf, state, module: 'export default {}', save: async () => {}, progress: () => {},
    fetcher: async url => Response.json(url.endsWith('/health') ? { service: 'obsidian-ai-mirror' } : { authorization_endpoint: state.workerUrl + '/authorize' }),
    saveRecovery: async () => { backups++; throw new Error('KV denied'); } }), /KV denied/);
  assert.equal(backups, 1); assert.equal(state.deployed, true); assert.deepEqual(state.secrets, originalSecrets);
});


function mutableCloud() {
  const live=fixture(), f=controlPlane(live), env={MIRROR_READ_KEY:'manual',MIRROR_READ_KEY_17:'local-older',MIRROR_TOKEN:live.secrets.write};
  f.spaces.push({id:recoveryId,title:RECOVERY_TITLE});
  f.bindings.push({type:'version_metadata',name:'CF_VERSION_METADATA'});
  const cloud=keyCloud(()=>env);let lost=false, writes=0;
  const cf=new Cloudflare('fixture-token',async(url,options)=>{
    const path=new URL(url).pathname, method=options.method;
    if(path.endsWith('/secrets') && method==='PUT'){
      const binding=JSON.parse(options.body);env[binding.name]=binding.text;cloud.nextVersion();writes++;
      if(lost){lost=false;throw new Error('Synthetic lost response');}
      return Response.json({success:true,result:{}});
    }
    if(path.includes('/secrets/') && method==='DELETE'){delete env[path.split('/').pop()];cloud.nextVersion();return Response.json({success:true});}
    return (await cloud.request(url,method,options.body)) || f.cf.fetcher(url,options);
  });
  const fetcher=async(url,options)=>{
    if(url.endsWith('/admin/read-keys/sync'))return cloud.request(url,options.method,null,options.headers);
    if(url.endsWith('/health'))return Response.json({service:'obsidian-ai-mirror',readKeySyncVersion:1});
    return mirror(live)(url,options);
  };
  function device(){
    let state=structuredClone(live);
    return {
      get state(){return state;},
      async sync(){state=await syncReadKeys({cf,state,fetcher});},
      run(action,kind,extra={}){return updateReadKey({cf,state,fetcher,action,kind,...extra,persist:async next=>{state=structuredClone(next);}});}
    };
  }
  return {device,env,cloud,get writes(){return writes;},loseNext(){lost=true;}};
}

test('live slots replace cached passwords, preserve arbitrary manual values and detect external removal',async()=>{
  const f=mutableCloud(),device=f.device();await device.sync();
  assert.equal(device.state.secrets.read,'manual');assert.equal(device.state.secrets.read17,'local-older');
  f.env.MIRROR_READ_KEY_481='外部新密码';delete f.env.MIRROR_READ_KEY_17;f.cloud.nextVersion();await device.sync();
  assert.equal(device.state.secrets.read481,'外部新密码');assert.equal(device.state.secrets.read17,undefined);
  delete f.env.MIRROR_READ_KEY;delete f.env.MIRROR_READ_KEY_481;f.cloud.nextVersion();await device.sync();
  assert.deepEqual(Object.keys(device.state.secrets),['write']);assert.equal(f.writes,0);
});

test('independent concurrent service additions retain both bindings and labels; an interrupted create resumes its original slot',async()=>{
  const f=mutableCloud(),a=f.device(),b=f.device();
  const [one,two]=await Promise.all([a.run('add',undefined,{name:'same service'}),b.run('add',undefined,{name:'same service'})]);
  assert.notEqual(one.kind,two.kind);await a.sync();
  assert.equal(a.state.readKeyNames[one.kind],'same service');assert.equal(a.state.readKeyNames[two.kind],'same service');
  assert.ok(a.state.secrets[one.kind]);assert.ok(a.state.secrets[two.kind]);
  f.loseNext();await assert.rejects(a.run('add',undefined,{name:'other'}),/lost response/);
  const pending=a.state.pendingKeyUpdate;await a.run('resume');assert.equal(a.state.secrets[pending.kind],pending.value);assert.equal(f.writes,3);
  await a.run('rename',pending.kind,{name:'new label'});assert.equal(a.state.readKeyNames[pending.kind],'new label');
  await a.run('delete',pending.kind);assert.equal(a.state.secrets[pending.kind],undefined);assert.ok(a.state.secrets[one.kind]);
});

test('a stale rotation cannot replace a concurrent external password change',async()=>{
  const f=mutableCloud(),device=f.device();await device.sync();
  f.env.MIRROR_READ_KEY_17='external replacement';f.cloud.nextVersion();
  await assert.rejects(device.run('rotate','read17'),/其他设备/);
  assert.equal(f.writes,0);assert.equal(device.state.secrets.read17,f.env.MIRROR_READ_KEY_17);
});

test('explicit account attachment verifies the old writer and custom bindings before upgrading a manual deployment',async()=>{
  const worker='obsidian-ai-mirror', bucket='custom-mirror-notes', write='existing-writer-password';
  const env={MIRROR_TOKEN:write,MIRROR_READ_KEY:'forgot',MIRROR_READ_KEY_882:'short'};
  const cloud=keyCloud(()=>env);
  let uploads=0;
  let settings={tags:['existing-user-tag'],bindings:[
    {type:'r2_bucket',name:'AI_MIRROR',bucket_name:bucket},{type:'kv_namespace',name:'OAUTH_KV',namespace_id:oauthId},
    {type:'secret_text',name:'MIRROR_READ_KEY_882'}]};
  const cf={
    list:async()=>[{id:recoveryId,title:RECOVERY_TITLE}],
    request:async(path,method='GET',body,options={})=>{
      if(path.endsWith('/settings'))return settings;
      if(path.endsWith('/workers/subdomain'))return {subdomain:'fixture'};
      if(path.endsWith('/r2/buckets/'+bucket))return {name:bucket};
      if(path.endsWith('/'+oauthId))return {id:oauthId};
      if(path.endsWith('/scripts/'+worker)&&body instanceof FormData){
        const updated=JSON.parse(await body.get('metadata').text());uploads++;
        assert.ok(updated.keep_bindings.includes('secret_text'));assert.ok(updated.tags.includes('existing-user-tag'));
        settings=updated;cloud.nextVersion();return {};
      }
      const reply=await cloud.request(path,method,body instanceof Uint8Array ? body : JSON.stringify(body));
      if(reply?.status===404&&options.missing)return null;
      assert.ok(reply?.ok,path);if(options.raw)return reply.text();
      const data=await reply.json();return options.envelope?data:data.result;
    }
  };
  const fetcher=async(url,options)=>{
    const route=new URL(url).pathname;
    if(route==='/admin/read-keys/sync')return cloud.request(url,options.method,null,options.headers);
    if(route.startsWith('/.well-known'))return Response.json({authorization_endpoint:new URL('/authorize',url).href,token_endpoint:new URL('/token',url).href});
    if(options.headers.Authorization!=='Bearer '+write)return new Response(null,{status:401});
    return route==='/health'?Response.json({service:'obsidian-ai-mirror'}):Response.json({error:'invalid note'},{status:400});
  };
  const attach=async credential=>{
    const record=await manualRecord(cf,account,worker,credential);
    return syncReadKeys({cf,state:record,fetcher,loadModule:async()=>'export default {}',attaching:true});
  };
  await assert.rejects(attach('incorrect-writer-password'));assert.equal(uploads,0);assert.equal(cloud.values.size,0);
  const restored=await attach(write);assert.equal(uploads,1);assert.equal(restored.manual,true);
  assert.equal(restored.names.bucket,bucket);assert.deepEqual(restored.secrets,{write,read:'forgot',read882:'short'});
});
