import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";
import { readKeys, syncReadKeys } from "../src/read-keys.js";

test("only canonical mirror read bindings are accessed, including sparse slots", () => {
  const env = { MIRROR_READ_KEY_100: "one hundred", MIRROR_READ_KEY_7: "seven", MIRROR_READ_KEY: "one",
    MIRROR_READ_KEY_01: "ignored", MIRROR_READ_KEY_1: "ignored", MIRROR_READ_KEY_9007199254740992: "too large" };
  Object.defineProperty(env, "UNRELATED_SECRET", { enumerable: true, get() { throw new Error("unrelated binding accessed"); } });
  assert.deepEqual(readKeys(env), [{ slot: 1, value: "one" }, { slot: 7, value: "seven" }, { slot: 100, value: "one hundred" }]);
});

test("an in-flight Worker cannot overwrite a competing challenge or publish the write credential", async () => {
  const nonce = randomBytes(32).toString("base64url"), nonceHash = createHash("sha256").update(nonce).digest("hex");
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveKey"]);
  const publicKey = Buffer.from(await crypto.subtle.exportKey("raw", pair.publicKey)).toString("base64url");
  const challenge = { version: 1, state: "challenge", nonceHash, publicKey, expiresAt: Date.now() + 60000 };
  const request = new Request("https://mirror.example/admin/read-keys/sync", { method: "POST", headers: { "X-Context-Anywhere-Challenge": nonce } });
  let writes = 0;
  const bucket = {
    head: async () => ({ etag: "older", size: 350, customMetadata: {} }),
    get: async (key, options) => {
      assert.equal(key, "__context_anywhere/read-keys-v1.json"); assert.deepEqual(options.onlyIf, { etagMatches: "older" });
      return { body: true, json: async () => challenge };
    },
    put: async (key, body, options) => {
      assert.equal(key, "__context_anywhere/read-keys-v1.json"); assert.deepEqual(options.onlyIf, { etagMatches: "older" });
      assert.ok(!body.includes("synthetic-private-read-value")); writes++;
      return null; // R2 rejected the write because a different control-plane request won.
    },
  };
  const env = { AI_MIRROR: bucket, MIRROR_READ_KEY_17: "synthetic-private-read-value" };
  assert.equal(await syncReadKeys(request, env, false), 409); assert.equal(writes, 1);
  env.MIRROR_TOKEN = env.MIRROR_READ_KEY_17;
  assert.equal(await syncReadKeys(request, env, false), 409); assert.equal(writes, 1);
  delete env.MIRROR_TOKEN;
  challenge.expiresAt = Date.now() - 1000;
  assert.equal(await syncReadKeys(request, env, false), 409); assert.equal(writes, 1);
});
