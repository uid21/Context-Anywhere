# Compatible service protocol

AI Bridge sends HTTPS requests to the endpoint entered by the user. Every request includes `Authorization: Bearer <write token>`.

## Health check

`GET /health`

Any `2xx` response is treated as successful.

## Notes

`PUT /note` with JSON:

```json
{
  "path": "Daily/2026-08-29.md",
  "content": "Markdown text",
  "mtime": 1787961600000
}
```

`DELETE /note?path=<vault-relative-path>` removes a note. A `404` response is accepted as already removed.

## Attachments

`PUT /asset?path=<attachment-path>&note=<note-path>` sends the raw file bytes. The request includes the attachment MIME type as `Content-Type` and its modification time as `X-Mirror-Mtime`.

`DELETE /asset?path=<vault-relative-path>` removes an attachment. A `404` response is accepted as already removed.

The service must validate tokens, paths, MIME types, and size limits independently. Never trust a client-side filter as the only security boundary.

## Context Anywhere Worker read passwords

Slot 1 uses `MIRROR_READ_KEY`. Later slots use `MIRROR_READ_KEY_N`, where N is a JavaScript safe integer of 2 or higher written without leading zeros. Slot numbers may have gaps. Either REST Bearer authentication or the OAuth consent form accepts an active read password. OAuth grants remain in the deployment's OAuth KV. A password change affects future consent and direct REST access.

Authenticated `GET /health` reports `readKeySyncVersion: 1`. A read password also receives its own numeric `readKeySlot`. For compatibility with older installers, `readKeySlots: 2` marks support for a second slot. It does not describe the number of configured passwords.

### Account recovery exchange

The setup program keeps a P-256 recovery private key in account-private management storage. The mirror Worker receives only the corresponding public key. The fixed R2 object is `__context_anywhere/read-keys-v1.json`, outside the note, asset and tombstone prefixes. Its only credential payload is encrypted. The account integration must verify the deployment identity, bucket and Worker origin before initiating the exchange.

1. Generate a random 32-byte nonce and encode it as unpadded base64url. Write the challenge below to the fixed R2 object through the account's management API. `nonceHash` is lowercase hex SHA-256 of the ASCII nonce. `publicKey` is the uncompressed 65-byte P-256 public point in unpadded base64url. Set `expiresAt` to an epoch timestamp in milliseconds within the next five minutes. Set `workerVersionId` to the active deployment version to pin the response during rollout.

   ```json
   { "version": 1, "state": "challenge", "nonceHash": "<hash>", "publicKey": "<recipient public key>", "expiresAt": 1800000000000, "workerVersionId": "<active version>" }
   ```

2. Send `POST /admin/read-keys/sync` with the nonce in `X-Context-Anywhere-Challenge` and an empty body. An upload Bearer credential can also trigger synchronization for the recipient already registered through the control plane. The HTTP response contains only `ok`. A 403 rejects the credential or nonce. A 409 indicates an unavailable, stale or conflicting enrollment. Retry with a fresh challenge after checking the current deployment.
3. Read the R2 object through the control plane. Check `version: 1`, `state: "ready"`, `nonceHash`, `recipientPublicKey` and the expected `workerVersionId`. Decode `publicKey` as the Worker's ephemeral P-256 public point. Derive a 256-bit AES-GCM key using ECDH and the recipient private key. Decrypt `ciphertext` with the 12-byte `iv`, a 128-bit authentication tag and UTF-8 additional data equal to `context-anywhere/read-keys/v1/` followed by `nonceHash`. The IV and ciphertext with appended tag use unpadded base64url. The UTF-8 plaintext has the shape `{"version":1,"keys":[{"slot":17,"value":"…"}]}`. Empty slots are omitted. If a read password equals the upload credential, the Worker refuses to publish the snapshot.

The Worker uses an R2 ETag precondition when replacing the object. A competing challenge cannot be overwritten by a delayed reply. After enrollment, successful REST or authenticated MCP requests also check for a newer Worker version in the background, at most once per minute per active isolate and version. The `CF_VERSION_METADATA` binding supplies the version ID and creation time. Older versions cannot roll back a newer envelope. A deliberate rollback can be confirmed with a fresh version-pinned challenge. During idle periods the previous encrypted snapshot stays in R2 until a request triggers synchronization. This workflow uses no cron trigger.
