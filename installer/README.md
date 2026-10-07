# Context Anywhere Windows Setup

Native Windows installer and setup wizard for the **public** Context Anywhere Worker and Obsidian plugin. Windows 10/11 x64, Chrome and an installed/enabled AI Bridge are required. No Node.js, npm, terminal commands or local web UI server are required on the user's PC.

1. Confirm a Cloudflare account with R2 enabled and an installed/enabled Obsidian plugin. Select the vault.
2. Sign in to Cloudflare in Chrome. The public Wrangler PKCE client is used; its consent screen says Wrangler. The setup wizard does not read or modify an existing Wrangler auth store. An account-scoped API Token is also supported.
3. Choose folders, attachment limits, device name, sync timing and optional two-way sync. Explicitly opt in before mirroring every Markdown file.
4. Create a separate Worker, R2 bucket and OAuth KV with a random installation suffix. Existing Worker names cannot be overwritten. Import settings through the plugin's AES-GCM encrypted URI; enter the temporary password in Obsidian. Plugin 0.4.1 automatically checks its connection and performs first sync. Plugin 0.4.0 remains compatible, retains its existing device name and needs a manual first sync.
5. Connect ChatGPT through a local Chrome DevTools port. The wizard fills the visible creation form and authorizes only its own Worker origin. It requires positive UI evidence before reporting a connection. Accounts without custom MCP access need manual setup. Other AI clients get copyable MCP URL, read password, JSON and Codex TOML; the exported text file excludes secrets.

Chrome 136+ cannot expose remote debugging from its default user-data directory. The wizard can open a dedicated Chrome session, whose login remains on the PC, or attach to an already-debuggable local Chrome port. It cannot transplant a normal profile's encrypted login. Login, MFA and browser security challenges are completed by the user. Changes to ChatGPT's UI can require updating the wizard; manual connection info is always available after deployment.

Deployment credentials are kept only for the current process. The installation receipt and mirror secrets are encrypted with Windows DPAPI for the current Windows user, in `%LOCALAPPDATA%\ContextAnywhereSetup\deployment.dpapi`. This receipt supports continuing a partial deployment. It represents one installation; a different vault should use a separate setup data directory. Closing the wizard ends its backend process. Uninstalling removes the program, and preserves the receipt, Chrome session, cloud resources and vault data.

The setup application is a native .NET Framework WinForms executable (the runtime is included in supported Windows versions). A bundled Node.js runtime executes deployment and CDP tasks over private stdin/stdout pipes; it does **not** listen for a web UI. Cloudflare's browser login uses a temporary loopback OAuth callback on port 8976. The optional Chrome DevTools connection is loopback-only.

## Build

From the repository root:

```powershell
npm ci
npm --prefix worker ci
npm --prefix installer ci
npm run check
npm run test:installer
npm run build:installer
npm run package:windows
```

Packaging needs Windows, the built-in .NET Framework C# compiler, and NSIS 3.11 on PATH or in its default installation path. Node.js 22.23.3 x64 is downloaded from nodejs.org and checked against the official SHA256 manifest. The output is `installer/dist/Context-Anywhere-Setup-0.1.0-x64.exe` and `SHA256SUMS.txt`. There is no bundled Electron, Chromium, Wrangler runtime or developer credential. The program is currently unsigned; Windows may show its standard unknown-publisher prompt.

`windows-setup-v*` tags build a draft prerelease with the installer, checksum and matching plugin files. Publish previews with the recorded acceptance scope and remaining limitations. Unit/build checks alone do not establish live ChatGPT access. The ChatGPT flow follows the [official custom MCP connection guide](https://developers.openai.com/api/docs/guides/custom-mcp-server); this preview's live browser acceptance is still pending.
