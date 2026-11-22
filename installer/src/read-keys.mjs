import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { bindingName, readKind, readSlot } from './cloudflare.mjs';
import { kvPath, syncReadKeys } from './key-snapshot.mjs';
import { SetupError } from './language.mjs';

const conflict = () => new SetupError('这把密码已在其他设备更改。已刷新列表，请检查后重试。', 'Another device changed this password. Check the refreshed list and retry.');
const invalid = () => new SetupError('请选择当前部署中的读取密码。', 'Select a read password from the current deployment.');

export function publicReadKeys(state) {
  return Object.keys(state.secrets).filter(readSlot).map(kind => ({ kind, slot: readSlot(kind), name: state.readKeyNames?.[kind] || '' })).sort((a, b) => a.slot - b.slot);
}

function serviceName(value) {
  const name = String(value || '').trim();
  if (name.length > 100 || /[\x00-\x1f\x7f]/.test(name)) throw new SetupError('服务名称最多 100 个字符。', 'Use up to 100 characters for the service name.');
  return name;
}
function newValue(value, secrets) {
  const next = value || randomBytes(32).toString('base64url');
  if (typeof next !== 'string' || !/^[\x21-\x7e]{20,1024}$/.test(next) || Object.values(secrets).includes(next))
    throw new SetupError('请使用不同于现有凭据的 20–1024 个可见 ASCII 字符，不含空格。', 'Use a unique password with 20–1024 printable ASCII characters and no spaces.');
  return next;
}

export async function updateReadKey({ cf, state, kind, action, value, name, persist, loadModule, fetcher = fetch }) {
  const sync = current => syncReadKeys({ cf, state: current, loadModule, fetcher });
  const live = await sync(state);
  let pending = state.pendingKeyUpdate;
  if (pending && !pending.action) pending = { ...pending, action: 'rotate', before: state.secrets[pending.kind] ?? null };
  if (pending && action !== 'resume') throw new SetupError('请先继续上次读取密码更改。', 'Resume the pending read password change first.');
  if (!pending) {
    await persist(live);
    if (action === 'resume') return { kind };
    if (action === 'add') {
      // Independent devices must not both replace the next sequential binding.
      do { kind = readKind(randomBytes(6).readUIntBE(0, 6)); } while (readSlot(kind) < 2 || live.secrets[kind]);
    } else if (!readSlot(kind) || !Object.hasOwn(live.secrets, kind)) throw invalid();
    if (action === 'import') {
      if (!value || live.secrets[kind] !== value) throw conflict();
      return { kind };
    }
    if (!['add', 'rename', 'rotate', 'delete'].includes(action)) throw invalid();
    if (['delete', 'rotate'].includes(action) && state.secrets[kind] !== live.secrets[kind]) throw conflict();
    pending = { kind, action, before: live.secrets[kind] ?? null };
    if (['add', 'rotate'].includes(action)) pending.value = newValue(value, live.secrets);
    if (['add', 'rename'].includes(action)) pending.name = serviceName(name);
    await persist({ ...live, pendingKeyUpdate: pending });
  }
  kind = pending.kind; action = pending.action;
  const desired = action === 'delete' ? null : pending.value;
  const current = live.secrets[kind] ?? null;
  if (action !== 'rename' && current !== desired && current !== pending.before) {
    await persist({ ...live, pendingKeyUpdate: undefined }); throw conflict();
  }
  let verified = live;
  if (action !== 'rename' && current !== desired) {
    const base = '/accounts/' + state.accountId + '/workers/scripts/' + state.names.worker + '/secrets';
    if (action === 'delete') await cf.request(base + '/' + bindingName(kind), 'DELETE', undefined, { missing: true });
    else await cf.request(base, 'PUT', { name: bindingName(kind), type: 'secret_text', text: desired });
    for (let i = 0; i < 4; i++) {
      verified = await sync(live);
      if ((verified.secrets[kind] ?? null) === desired) break;
      if (i === 3) throw new SetupError('更改已提交，请稍后继续上次更改。', 'The change was submitted. Resume it once the Worker updates.');
      await delay(200 * (i + 1));
    }
  }
  if (['add', 'rename', 'delete'].includes(action)) {
    const key = 'label:' + state.names.worker + ':' + readSlot(kind);
    const kv = kvPath(state, verified.recoveryNamespaceId);
    if (pending.name) {
      await cf.request(kv + '/bulk', 'PUT', [{ key, value: pending.name, metadata: { name: pending.name } }]);
      verified.readKeyNames[kind] = pending.name;
    } else {
      await cf.request(kv + '/values/' + encodeURIComponent(key), 'DELETE', undefined, { missing: true });
      delete verified.readKeyNames[kind];
    }
  }
  await persist({ ...verified, pendingKeyUpdate: undefined }); return { kind };
}
