import { randomUUID, createHash } from 'node:crypto';
import { syncReadKeys } from '../../worker/src/read-keys.js';

// Only the provider storage and version metadata are simulated. The production
// Worker performs key selection, challenge authentication and encryption.
export function keyCloud(bindings) {
  let version = randomUUID(), body = null, customMetadata = {};
  const values = new Map(), key = '__context_anywhere/read-keys-v1.json';
  const etag = () => createHash('sha256').update(body || '').digest('hex');
  const bucket = {
    async head() { return body === null ? null : { customMetadata, etag: etag(), size: body.length }; },
    async get(_key, options) { return options.onlyIf.etagMatches === etag() ? { body: true, json: async () => JSON.parse(body) } : null; },
    async put(_key, value, options) { if (options.onlyIf.etagMatches !== etag()) return null; body = value; customMetadata = options.customMetadata; return { etag: etag() }; }
  };
  return {
    values, nextVersion() { version = randomUUID(); },
    async request(url, method, input, headers = {}) {
      const u = new URL(url, 'https://fixture.test'), path = u.pathname;
      const json = value => Response.json({ success: true, result: value });
      if (path.endsWith('/deployments')) return json({ deployments: [{ versions: [{ percentage: 100, version_id: version }] }] });
      if (path.endsWith('/objects/' + key)) {
        if (method === 'PUT') { body = Buffer.from(input).toString(); customMetadata = {}; return json({}); }
        return body === null ? new Response('', { status: 404 }) : new Response(body);
      }
      if (path.endsWith('/bulk') && method === 'PUT') {
        for (const entry of JSON.parse(input)) values.set(entry.key, entry);
        return json({});
      }
      if (path.includes('/values/')) {
        const name = decodeURIComponent(path.split('/values/')[1]);
        if (method === 'DELETE') { values.delete(name); return json({}); }
        return values.has(name) ? new Response(values.get(name).value) : new Response('', { status: 404 });
      }
      if (path.endsWith('/keys')) return Response.json({ success: true, result: [...values.values()].filter(v => v.key.startsWith(u.searchParams.get('prefix'))).map(v => ({ name: v.key, metadata: v.metadata })), result_info: { cursor: '' } });
      if (path === '/admin/read-keys/sync') {
        const status = await syncReadKeys(new Request('https://fixture.test' + path, { method, headers }), { ...bindings(), AI_MIRROR: bucket, CF_VERSION_METADATA: { id: version, timestamp: new Date().toISOString() } }, false);
        return Response.json({ ok: status === 200 }, { status });
      }
      return null;
    }
  };
}
