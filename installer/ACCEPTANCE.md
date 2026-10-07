# Windows setup 0.1.0 acceptance

Recorded on 2026-10-07, Windows x64 build 26200. Testing used a gpt-6.1-sol / max subagent, the existing test Obsidian vault, and a new isolated deployment in the existing Cloudflare account. It did not use the production mirror for acceptance.

| Area | Evidence and result |
| --- | --- |
| Native wizard | Actual WinForms `.exe` launched and exited with its Node child. No HTTP UI server. Account selection was tested through the real Token connection button; a JSON array type mismatch found during testing was fixed and regressed. |
| Independent deployment | Actual native deployment button created `ca-installer-test-a7f22e52`, a separate `-notes` R2 bucket and `-oauth` KV. Cloudflare GET checks confirmed the Worker binds those resources. |
| Encrypted Obsidian import | Actual vault/plugin UI imported the settings into the selected vault. A vault-name space encoding issue found during testing was fixed and regressed. Plugin 0.4.1 preserved the selected device name, scope and sync options. |
| Automatic first sync | Only `InstallerAcceptance/acceptance.md` was present remotely. Its SHA256 matched the synthetic local fixture; an outside-scope note was absent, no attachments were uploaded, and the plugin recorded a sync time without an error. |
| OAuth and MCP | 37 live checks passed: discovery, public registration, S256 PKCE, CSRF and wrong-password rejection, script-free consent transition, initialization, read tool enumeration, search/get/recent, refresh and resource validation. Only read tools were exposed. Read credentials and OAuth access tokens could not write. These are independent protocol checks, not ChatGPT UI acceptance. |
| Manual configuration | Actual step-five UI displayed the MCP endpoint, hidden read password, JSON and Codex TOML. JSON/TOML line breaks were regressed after correcting native Windows newline handling. Copy-button acceptance and the final page-scroll correction were not completed while the user was operating that window. |
| Installation/uninstallation | Final installer was installed silently into a scoped test directory. Native executable, backend, Node runtime and Worker payload matched the packaged files. Uninstallation removed program files and registration; the encrypted test receipt stayed unchanged. |
| Local checks | Plugin: 17 tests; Worker: 8 tests; installer: 8 tests, including actual Windows DPAPI. Lint, plugin build, Worker dry run, backend build and native compilation passed. |

ChatGPT's actual create/install/read flow remains **unverified**. The existing test Chrome was not replaced or logged out. Computer Use terminated browser input because it could not reliably determine that window's URL, including after the user made the address bar visible. No further input was issued to that browser. The installed dedicated-CDP mode and Cloudflare browser PKCE sign-in were not accepted through a real browser; the tested Cloudflare path used an existing OAuth credential in the Token field. Manual connection information remains available.

Raw local screenshots, credential caches, deployment receipts and the detailed acceptance JSON are excluded from Git and release assets. The only original Wrangler cache change was a normal OAuth credential refresh; production Worker/storage resources and the primary vault were not modified. This preview is unsigned; broader Windows-version coverage, interruption recovery during a real failed deployment, and long-running sync are not covered by this acceptance.
