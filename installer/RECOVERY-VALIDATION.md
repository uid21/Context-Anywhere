# Recovery validation

## Windows Setup 1.1.0 · 2026-11-22

The existing original-device and new-device acceptance vaults ran AI Bridge 0.4.3 in Obsidian 1.15.0 on the same Windows PC against their dedicated Cloudflare Worker, R2 bucket and OAuth KV. A note edited through Obsidian reached the mirror automatically, the second vault downloaded the identical text, and a real OAuth MCP client read the note. An excluded note remained absent. The test also exercised the one-use settings import in the installed app.

The live deployment began with one read password. Setup added a named service password. A separate control-plane request added secret number 17 while retaining the other passwords. Ordinary authenticated traffic updated the encrypted R2 snapshot. A new wizard state recovered all three passwords and the service label after Cloudflare sign-in. Changing the external secret updated the value returned to the wizard. Removing both temporary passwords disabled direct access with their values, while an issued grant still refreshed. The temporary credentials, grants and test note were removed after verification.

The account-private recovery index now stores deployment identity and the upload credential. The Worker backs up its active read passwords encrypted for the recovery recipient. The account-private KV holds the decryption material. The final ZIP passed its integrated checks, and the deployed Worker payload matched the file in the ZIP. Live evidence is stored outside Git in `.codex/live-acceptance-20261122/`.

## Historical Windows Setup 1.0.0 validation · 2026-11-05

The sections below describe the original single-password recovery design and its original acceptance run.

### Behavior and storage

- Cloudflare sign-in discovers recovery records in the selected account. Restoring retrieves mirror credentials, URL and resource identities; each device selects its own local vault and sync scope.
- Recovery copies use the account-private `context-anywhere-recovery-v1` KV namespace, separate from notes and OAuth storage and never bound to the mirror Worker.
- No Cloudflare login token, note content, local vault path or local sync scope is archived. Discovery does not retrieve credential values.
- Restoration verifies account identity, resource ownership, bindings, and credentials before replacing local state. It does not redeploy resources or rotate credentials.
- Each Windows user protects the restored local record with DPAPI. Old Windows encrypted files do not need to be transferred.
- A failed backup preserves the healthy mirror and offers a focused retry. Older deployments can add a recovery copy from their original device after Cloudflare sign-in.

### Validation coverage

- Installer unit tests cover discovery, private storage, malformed records, account/resource mismatch, invalid credentials, cursor handling, localization and failure preservation.
- Packaged integration tests exercise the bundled backend, local workerd/R2/KV, real private RPC and DPAPI, one-use Obsidian import, persistent vault binding and restart.
- Native UI tests cover 50 page/viewport combinations, both languages, saved inputs, credential copy, recovery selection and retry, scope editing, motion reversal and nested scrolling.

The 2026-11-05 desktop acceptance used the actual WPF executable, Obsidian 1.14.4 and AI Bridge 0.4.2, with two synthetic vaults and separate empty local state directories on the same PC. The original device deployed an isolated mirror; the second device signed in independently, discovered and restored it without copying credentials, imported through the normal Obsidian URI flow, downloaded the original note, and uploaded a new note. Private excluded notes stayed outside the mirror. Editing in Obsidian triggered an automatic upload, and reopening the restored wizard reused its local record without another Cloudflare login.

This validates absent local state on one PC, not a physically separate Windows computer/account. Fresh ChatGPT onboarding was not part of that recovery acceptance. Local evidence remains under `installer/test-output/recovery-desktop-2026-11-05/` and is excluded from Git.
