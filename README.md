# Context Anywhere

**English** · [中文](README.zh-CN.md)

Tools should do what they are best at: write in Obsidian, ask directly in any remote AI, and read from any device—even when the computer holding your vault is powered off. **Context Anywhere syncs your selected notes to your own Cloudflare account so both you and your AI can access them from the web or your phone.**

Any AI client that supports custom remote MCP—whether a web app, mobile app, or a harness agent on another machine—can read your knowledge base and collaborate with you without tying your vault and AI to the same device.

## Setup

### Quick Start on Windows

You need a Cloudflare account with R2 enabled, a local Obsidian vault, and any AI client that supports remote MCP and OAuth. **AI Bridge is the Obsidian plugin** that handles syncing, while the wizard provisions the cloud mirror in your Cloudflare account.

1. Install and enable the [AI Bridge community plugin](https://community.obsidian.md/plugins/ai-bridge) in your vault (or install it manually from Releases).
2. Download the [Windows x64 wizard ZIP](https://github.com/uid21/Context-Anywhere/releases?q=windows-setup), extract it completely, and run `ContextAnywhere.exe`.
3. Select your local vault, sign in to Cloudflare, and choose the folders or notes you want to sync (create a new mirror on first use, or detect and restore an existing deployment on a new PC). Keep Obsidian open, click **Import into Obsidian** in the wizard, and verify the first sync.
4. On the **Connect your AI** screen, copy the URL ending in `/mcp`. Add it as a remote MCP server in your AI client and select OAuth. **Enter your read password (`MIRROR_READ_KEY`) on the redirected mirror OAuth authorization page—not in your AI client's settings fields.** Once connected, ask your AI to find a note you just synced.

More details: [Windows setup, recovery, and password management](installer/README.md#english)

### macOS / Linux or Manual Setup

See the [manual setup guide for macOS, Linux, or CLI](docs/manual-setup.md).

### Deploy with an Agent

Click **Copy** in the top-right corner of the block below and paste the prompt into an agent with local computer and terminal access:

```text
Help me deploy Context Anywhere from this repository:
https://github.com/uid21/Context-Anywhere

Open the repository and follow README.md, AGENTS.md, and the relevant setup guide. Use the released Windows wizard when available, or the command-line guide for terminal-only setup. First confirm my Cloudflare account, Obsidian vault, and which notes or folders I want to share. Restore an existing mirror if there is one, or create a dedicated mirror. Hand control to me for sign-in or authorization, then resume setup.

Configure AI Bridge in Obsidian and sync the selected notes. Add the remote MCP server to my AI client, authorize it with OAuth, and verify that the client can read an approved note. Report the MCP URL, the actual sync scope, and the verification result. Keep credentials in secure storage or the appropriate authorization screen.
```

[Full agent deployment prompt (Chinese)](docs/deploy-with-agent.zh-CN.md)

## How It Works

Once **AI Bridge** is installed in Obsidian, your selected notes sync through a Cloudflare Worker into your private R2 bucket, and the Worker exposes a standard MCP Server endpoint. After syncing, your AI reads straight from the remote mirror—no connection to your main computer required.

Available MCP tools:

| Tool | Purpose |
| --- | --- |
| `search_notes` | Search note paths and content in the mirror |
| `get_note` | Read the full content of a Markdown note |
| `recent_notes` | List recently modified notes |
| `list_note_attachments` | List attachments allowed for a specific note |
| `read_attachment` | Read permitted images or explicitly allowed PDFs |

For writing back to your vault, ask your AI to return an official Obsidian URI, such as:

```text
obsidian://new?vault=<vault>&file=<path>&content=<URL-encoded-content>&append
```

Opening the URI lets your local Obsidian app perform the actual write, after which AI Bridge and your existing sync setup handle propagation. MCP clients never have direct write permissions on your cloud mirror.

### What Gets Shared?

- **You choose the scope:** Start with a single folder or sync the whole vault. If you already use an encrypted primary sync, you can create a dedicated mirror bucket just for AI. Sensitive directories like `.obsidian` and local secrets are always excluded.
- **Referenced attachments only:** When attachment sync is enabled, only supported files referenced by permitted notes are uploaded (nested folders like `Daily/assets/` work out of the box—no central attachments folder needed). Default limit is 8 MiB per file; unreferenced files stay local.
- **Read-only AI access:** Your AI can search notes, read text, and inspect permitted attachments, with zero ability to alter or delete mirror files.
- **Optional cross-device sync:** By default, Obsidian only uploads to the mirror. To pull notes onto another device, install AI Bridge there, import an encrypted settings link, and enable two-way sync. If edits conflict, the older copy is kept locally in `AI Bridge Conflicts`.

## Usage

Invoke the connector with `@` (or however your AI client triggers MCP tools) and ask in plain language—for example: *"Check my project notes from last week, list the open decisions, and cite the source notes."*

## Estimated Cost (Cloudflare Free Tier)

For a typical personal Markdown vault with occasional image attachments, everyday syncing and MCP reads fit comfortably within Cloudflare's Free Plan (enabling R2 requires adding a payment method, with no charge unless you exceed free limits):

- **Cloudflare Workers:** 100,000 requests/day (10 ms CPU time per request) on the Free plan. Paid plans start at $5/month. [Official pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- **Cloudflare R2:** 10 GB storage/month, 1,000,000 Class A operations (writes), 10,000,000 Class B operations (reads), and zero egress fees. [Official pricing](https://developers.cloudflare.com/r2/pricing/)
- **Cloudflare Workers KV:** Stores only lightweight OAuth state (never your note content). Free tier includes 1 GB storage, 100,000 reads/day, and 1,000 writes/deletes/day. [Official pricing](https://developers.cloudflare.com/workers/platform/pricing/) · [Limits](https://developers.cloudflare.com/kv/platform/limits)

Licensed under PolyForm Noncommercial 1.0.0. See the [LICENSE](LICENSE) file for full terms.
