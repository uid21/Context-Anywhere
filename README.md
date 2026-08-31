# Context Anywhere

> **Bring your own notes. Bring your own AI. Keep them independent and always readily accessible.**

[中文](README.zh-CN.md) · **English**


## Overview

Context Anywhere is a complete workflow that turns an Obsidian knowledge base into a **private context layer that AI can read remotely**.

What it does: it lets any AI that supports custom MCP — whether on the web, in an app, or as a harness agent on another device — access your knowledge base, so AI can use your knowledge to work with you anytime and anywhere. Your Vault and your AI do not have to be on the same device, and it also provides the kind of functionality a sync plugin provides.

The idea is simple: you can use ChatGPT today and switch to another AI tomorrow, as long as you configure a custom MCP; you can organize notes on Windows, add a sentence on your iPhone, and then continue the discussion in a web AI. Your knowledge does not have to move with a particular AI client.

A good use case :
- You only need to record things whenever they come to mind.
- Let AI expand them, connect them, and find historical context anytime and anywhere.
- Then decide: keep going / turn it into a project / leave it for later / throw it away.
- Turn messy ideas into actionable plans.

Traditional AI plugins usually just open Codex or another agent in your sidebar; once your computer is turned off, everything is gone. So this is not another plugin that simply puts an AI chat box inside Obsidian.

## Workflow

By default, AI Bridge in Obsidian is a one-way mirror: the plugin sends eligible content to the Worker, and the Worker stores it in an independent R2 bucket. Optional two-way sync is available but is deliberately **off by default**. Configuration paths such as `.obsidian`, the local conflict-copy directory, and sensitive settings such as your keys are always excluded.

You can also choose which folders should be mirrored. Anything outside the folders you specify is excluded. This mode is useful if you already have a primary sync system with encryption, but want a separate unencrypted bucket that contains only the content you are comfortable exposing to AI. 

Synchronization can run at startup, when an eligible file changes, on a schedule, or when you press **Sync now**. When two-way sync is enabled, those same triggers both upload and download. If the same file changed on both devices, the copy with the later modification time wins; the older copy is preserved in the clearly visible `AI Bridge Conflicts` folder instead of being silently discarded. Give each device a recognizable name so the conflict filename tells you where the older copy came from. Keep device clocks reasonably accurate because the winner is chosen from file modification times.

For attachments, when attachment syncing is enabled, AI Bridge checks which files are referenced by eligible notes. Referenced attachments can live in nested folders such as `Daily/assets/`; they do not need to be in one global attachments directory. The size limit is configurable and defaults to 8 MiB. Unreferenced attachments are not mirrored.

At the same time, AI can access the Worker through an MCP Server. After the user completes OAuth authorization, the Worker issues the MCP client a read-only OAuth Access Token for searching and reading mirrored content.

The MCP tools are:

| Tool | Purpose |
| --- | --- |
| `search_notes` | Search note paths and contents in the mirror |
| `get_note` | Read one Markdown note |
| `recent_notes` | View recently modified notes |
| `list_note_attachments` | View the attachments of a note that are allowed to be provided to AI |
| `read_attachment` | Read an allowed image or an explicitly enabled PDF |

Once content has entered the remote mirror, AI no longer needs to connect to the computer that stores the main vault in order to read it.

For AI write-back, have the AI return the content it wants to output as an official Obsidian URL so it can be written on your own device, for example:

```
obsidian://new?vault=<vault>&file=<path>&content=<URL-encoded-content>&append
```
When the device opens this URI, the local Obsidian app performs the actual write.

After the device completes the write, AI Bridge and any other sync system you configured handle their own subsequent synchronization. The MCP client does not have direct write access to mirrored content.



## Quick Deployment


### 1. Install the AI Bridge plugin

From the **Obsidian Community Plugins**: the plugin is currently still under review. Once it is officially listed, it can be installed directly from the Community Plugins page.

**Manual installation:** if you use the build files from a Release, copy these three files:

```text
main.js
manifest.json
styles.css
```

to your Vault:

```text
<your Vault>/.obsidian/plugins/ai-bridge/
```

Then go to **Settings → Community plugins** and enable **AI Bridge**.

If you build the plugin from source, first run the following in the project root:

```powershell
npm install
npm run build
```

Then copy the three build files above.

### 2. Check the source and log in to Cloudflare

You need a Cloudflare account, Node.js/npm, and this project's source code.

Run the following in the project root:

```powershell
npm install
npm --prefix worker install
npm run check
cd worker
npx wrangler login
npx wrangler whoami
```

`npm run check` checks whether the plugin and Worker can be tested, built, and dry-run successfully. Passing this check does not mean that the real Cloudflare resources have already been bound successfully.

### 3. Create R2 and OAuth KV

Create two independent resources in the `worker` directory:

```powershell
npx wrangler r2 bucket create my-obsidian-ai-mirror
npx wrangler kv namespace create my-obsidian-ai-mirror-oauth
```

After creating the KV namespace, record the **Namespace ID** returned by Cloudflare.

If you already have an encrypted primary sync bucket, create a separate R2 mirror bucket here instead of directly reusing the primary sync bucket.

### 4. Create the Worker configuration

Create the real configuration from the public template:

```powershell
Copy-Item .\wrangler.example.toml .\wrangler.toml
```

Open `worker/wrangler.toml` and make sure that at minimum:

- `name` is your Worker name;
- `bucket_name` is the AI Mirror R2 Bucket you just created;
- `id` is the KV Namespace ID you just created;
- the R2 binding remains `AI_MIRROR`;
- the KV binding remains `OAUTH_KV`.

Do not put real Secrets in `wrangler.toml`.

### 5. Create two Secrets and deploy the Worker

Use Node.js to generate two different random values:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Use them as:

- `MIRROR_TOKEN`: used by the Obsidian plugin for uploading/synchronization;
- `MIRROR_READ_KEY`: entered only on the Worker's OAuth authorization page.

Store them in Cloudflare:

```powershell
npx wrangler secret put MIRROR_TOKEN --config wrangler.toml
npx wrangler secret put MIRROR_READ_KEY --config wrangler.toml
npx wrangler deploy --config wrangler.toml
```

After deployment, Wrangler returns the Worker's HTTPS address.

Do not mix up these two addresses:

- Obsidian AI Bridge uses the Worker **root URL**, for example `https://xxx.workers.dev`;
- the AI client uses the full MCP URL: `https://xxx.workers.dev/mcp`.

### 6. Configure Obsidian AI Bridge

Go to:

**Settings → AI Bridge**

Fill in:

1. Worker root URL;
2. Write Token (`MIRROR_TOKEN`);
3. folders to mirror;
4. whether attachments should be uploaded;
5. whether optional two-way sync should be enabled;
6. a recognizable device name;
7. whether scheduled synchronization should be enabled and its interval.

Then test the connection and run one full synchronization.

If the folder list is left empty, all eligible Markdown files are allowed into the mirror.

Two-way sync is off by default. When enabled, a later edit replaces the canonical copy and an older competing edit is saved under `AI Bridge Conflicts`. That folder is local evidence for review and is never uploaded again. This is simple last-modified-time reconciliation, not collaborative paragraph-by-paragraph merging.

If, like me, you already have an encrypted primary sync system, it is better to explicitly specify folders rather than leaving the list empty.

### 7. Transfer settings to a mobile device

On a device that has already been configured, create an “encrypted settings link.”

The plugin asks you to set a temporary transfer password, then encrypts the current Worker URL, Write Token, and AI Bridge configuration into an `obsidian://` link.

Open or paste this link on the mobile device, then enter the same temporary password to import the settings.

### 8. Connect an AI

First, enable developer mode in account security and allow unofficial MCP plugins if your AI client requires it.

MCP Endpoint:

```text
https://<your-worker-domain>/mcp
```

If the client supports OAuth, choose OAuth.

The authorization page is displayed by the AI Bridge Worker itself and asks for the Mirror Read Password.

After authorization, the AI receives a read-only OAuth Access Token rather than the Write Token used for uploading.

### 9. Usage

Use `@` — using GPT as an example — to invoke the plugin and describe what you need in plain language. Leave the rest to the AI.

## License

This project uses the **PolyForm Noncommercial License 1.0.0**.

Personal study, research, modification, and noncommercial use are allowed. For the exact terms, see the `LICENSE` file in the repository.

## Possible Costs

### Cloudflare Workers

Worker Free currently includes:

- **100,000 requests per day**;
- up to **10 ms of CPU time per request**.

This is usually more than enough for synchronization and MCP reads for a personal knowledge base. If higher limits are needed, Workers Paid currently starts at **$5 / month / account**.

Official pricing: <https://developers.cloudflare.com/workers/platform/pricing/>

### Cloudflare R2

**R2 Standard** is recommended for AI Mirror. The current monthly free tier includes:

- **10 GB-month** of storage;
- **1,000,000 Class A** operations, mainly writes and modifications;
- **10,000,000 Class B** operations, mainly reads;
- public **Egress is free**.

Current R2 Standard pricing beyond the free tier is:

- Storage: **$0.015 / GB-month**;
- Class A: **$4.50 / 1 million operations**;
- Class B: **$0.36 / 1 million operations**.

For a personal Vault that is mostly Markdown with only a small number of image attachments, normal use is usually unlikely to exceed the free tier.

Official pricing: <https://developers.cloudflare.com/r2/pricing/>

### Cloudflare Workers KV

KV is used here only to store OAuth-related state. It does not store the contents of your notes.

The Free Plan currently includes:

- **1 GB** of storage;
- **100,000 reads per day**;
- **1,000 writes / deletes / List operations per day**.

The amount of OAuth state used by this project in normal personal use is very small and usually will not come close to these limits.

Under Workers Paid, current KV pricing beyond the included usage is:

- Reads: **$0.50 / 1 million**;
- Writes, deletes, and List operations: **$5.00 / 1 million**;
- Storage: **$0.50 / GB-month**.

Official pricing and limits: <https://developers.cloudflare.com/workers/platform/pricing/> · <https://developers.cloudflare.com/kv/platform/limits/>
