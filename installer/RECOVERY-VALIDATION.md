# Recovery validation

Account recovery was validated on 2026-11-05 during development and ships with Windows Setup 1.0.0. The UI was subsequently refined and tested separately.

## Behavior and storage

- Cloudflare sign-in discovers recovery records in the selected account. Restoring retrieves mirror credentials, URL and resource identities; each device selects its own local vault and sync scope.
- Recovery copies use the account-private `context-anywhere-recovery-v1` KV namespace, separate from notes and OAuth storage and never bound to the mirror Worker.
- No Cloudflare login token, note content, local vault path or local sync scope is archived. Discovery does not retrieve credential values.
- Restoration verifies account identity, resource ownership, bindings, and credentials before replacing local state. It does not redeploy resources or rotate credentials.
- Each Windows user protects the restored local record with DPAPI. Old Windows encrypted files do not need to be transferred.
- A failed backup preserves the healthy mirror and offers a focused retry. Older deployments can add a recovery copy from their original device after Cloudflare sign-in.

## Validation coverage

- Installer unit tests cover discovery, private storage, malformed records, account/resource mismatch, invalid credentials, cursor handling, localization and failure preservation.
- Packaged integration tests exercise the bundled backend, local workerd/R2/KV, real private RPC and DPAPI, one-use Obsidian import, persistent vault binding and restart.
- Native UI tests cover 50 page/viewport combinations, both languages, saved inputs, credential copy, recovery selection and retry, scope editing, motion reversal and nested scrolling.

The 2026-11-05 desktop acceptance used the actual WPF executable, Obsidian 1.14.4 and AI Bridge 0.4.2, with two synthetic vaults and separate empty local state directories on the same PC. The original device deployed an isolated mirror; the second device signed in independently, discovered and restored it without copying credentials, imported through the normal Obsidian URI flow, downloaded the original note, and uploaded a new note. Private excluded notes stayed outside the mirror. Editing in Obsidian triggered an automatic upload, and reopening the restored wizard reused its local record without another Cloudflare login.

This validates absent local state on one PC, not a physically separate Windows computer/account. Fresh ChatGPT onboarding was not part of that recovery acceptance. Local evidence remains under `installer/test-output/recovery-desktop-2026-11-05/` and is excluded from Git.
