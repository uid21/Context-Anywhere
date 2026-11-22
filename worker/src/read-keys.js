// Passwords leave the Worker only as an envelope encrypted to the public key
// registered via the account's R2 control plane. Never enumerate binding values.
const SNAPSHOT = "__context_anywhere/read-keys-v1.json";
const encoder = new TextEncoder();
const curve = { name: "ECDH", namedCurve: "P-256" };
const aes = { name: "AES-GCM", length: 256 };

export function readKeys(env) {
  const keys = [];
  for (const name of Object.keys(env)) {
    const match = /^MIRROR_READ_KEY(?:_([1-9]\d*))?$/.exec(name);
    if (!match) continue;
    const slot = match[1] ? Number(match[1]) : 1;
    if (!Number.isSafeInteger(slot) || (match[1] && slot < 2)) continue;
    if (typeof env[name] === "string" && env[name]) keys.push({ slot, value: env[name] });
  }
  return keys.sort((a, b) => a.slot - b.slot);
}

function base64url(bytes) {
  let binary = "";
  const view = new Uint8Array(bytes);
  for (let i = 0; i < view.length; i += 16384) binary += String.fromCharCode(...view.subarray(i, i + 16384));
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function publicPoint(encoded) {
  if (typeof encoded !== "string" || !/^[A-Za-z0-9_-]{87}$/.test(encoded)) return null;
  const bytes = Uint8Array.from(atob(encoded.replaceAll("-", "+").replaceAll("_", "/")), c => c.charCodeAt(0));
  return bytes[0] === 4 && base64url(bytes) === encoded ? bytes : null;
}

async function hashNonce(nonce) {
  const bytes = await crypto.subtle.digest("SHA-256", encoder.encode(nonce));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function seal(env, recipientPublicKey, nonceHash) {
  const point = publicPoint(recipientPublicKey);
  if (!point) return null;
  const keys = readKeys(env);
  if (keys.some(key => key.value === env.MIRROR_TOKEN)) return null;
  let recipient;
  try { recipient = await crypto.subtle.importKey("raw", point, curve, false, []); }
  catch { return null; }
  const ephemeral = await crypto.subtle.generateKey(curve, false, ["deriveKey"]);
  const secret = await crypto.subtle.deriveKey({ name: "ECDH", public: recipient }, ephemeral.privateKey, aes, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv,
    additionalData: encoder.encode("context-anywhere/read-keys/v1/" + nonceHash) }, secret, encoder.encode(JSON.stringify({ version: 1, keys })));
  const version = env.CF_VERSION_METADATA;
  return { version: 1, state: "ready", nonceHash, recipientPublicKey,
    publicKey: base64url(await crypto.subtle.exportKey("raw", ephemeral.publicKey)), iv: base64url(iv), ciphertext: base64url(ciphertext),
    workerVersionId: version?.id || "", workerVersionTimestamp: version?.timestamp || "" };
}

// A challenge travels in the object body. For a ready envelope its nonsecret
// metadata suffices, so background checks never download encrypted passwords.
async function synchronize(env, { nonce, write = false, background = false }) {
  if (!write && !background && !/^[A-Za-z0-9_-]{43}$/.test(nonce || "")) return 403;
  const bucket = env.AI_MIRROR;
  const head = await bucket.head(SNAPSHOT);
  if (!head) return 409;
  let entry = head.customMetadata;
  const ready = entry?.state === "ready";
  if (!ready) {
    if (head.size > 2048) return 409;
    const challenge = await bucket.get(SNAPSHOT, { onlyIf: { etagMatches: head.etag } });
    if (!challenge?.body) return 409;
    try { entry = await challenge.json(); } catch { return 409; }
    if (entry?.state !== "challenge" || entry.version !== 1) return 409;
  }
  if (typeof entry.nonceHash !== "string" || !/^[0-9a-f]{64}$/.test(entry.nonceHash)) return 409;
  if (!write && !background && (await hashNonce(nonce) !== entry.nonceHash ||
    (ready && !(Number(entry.expiresAt) > Date.now())))) return 403;
  const version = env.CF_VERSION_METADATA;
  if (ready) {
    if (entry.workerVersionId === (version?.id || "")) return 200;
    // In-flight old versions and split traffic must not roll the backup back.
    // A deliberate rollback is acknowledged by a fresh control-plane challenge.
    const previousTime = Date.parse(entry.workerVersionTimestamp || "");
    const currentTime = Date.parse(version?.timestamp || "");
    if (!version?.id || !Number.isFinite(currentTime) || (entry.workerVersionId && !(currentTime > previousTime))) return 409;
  } else {
    const now = Date.now();
    // The nonce expires, the account-registered recipient does not. A later
    // authenticated request can finish enrollment even if setup closed mid-sync.
    if (!Number.isFinite(entry.expiresAt) || (!background && !write && entry.expiresAt <= now) || entry.expiresAt > now + 300000) return 409;
    if (entry.workerVersionId !== undefined && entry.workerVersionId !== version?.id) return 409;
  }
  const payload = await seal(env, ready ? entry.recipientPublicKey : entry.publicKey, entry.nonceHash);
  if (!payload) return 409;
  const { state, nonceHash, recipientPublicKey, workerVersionId, workerVersionTimestamp } = payload;
  const saved = await bucket.put(SNAPSHOT, JSON.stringify(payload), { onlyIf: { etagMatches: head.etag },
    httpMetadata: { contentType: "application/json", cacheControl: "no-store" },
    customMetadata: { state, nonceHash, recipientPublicKey, workerVersionId, workerVersionTimestamp, expiresAt: String(entry.expiresAt) } });
  return saved ? 200 : 409;
}

export async function syncReadKeys(request, env, write) {
  if (request.method !== "POST") return 405;
  try { return await synchronize(env, { write, nonce: request.headers.get("X-Context-Anywhere-Challenge") }); }
  catch { return 503; }
}

let lastVersion, nextCheck = 0;
export function refreshReadKeys(env, ctx) {
  const id = env.CF_VERSION_METADATA?.id;
  const now = Date.now();
  if (!id || (id === lastVersion && now < nextCheck)) return;
  lastVersion = id; nextCheck = now + 60000;
  ctx.waitUntil(synchronize(env, { background: true }).catch(() => {}));
}
