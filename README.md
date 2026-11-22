# Context Anywhere

**English** · [中文](README.zh-CN.md)

Keep writing in Obsidian and ask questions in the AI app you already use. **Context Anywhere copies the notes you choose to your own Cloudflare account so your AI can read them from the web or your phone.** Once the notes have synced, the computer that holds your vault can be offline.

Suppose you took meeting notes on your laptop and added a thought on your phone. Before the next meeting, ask your AI, “Which decisions did we leave open last week? Show me the notes they came from.” If you switch AI clients, connect the new one to the same mirror.

## Get started on Windows

You need an Obsidian vault, a Cloudflare account with R2 enabled, and an AI client that supports remote MCP servers and OAuth. **AI Bridge is the Obsidian plugin** that syncs your notes. The Windows wizard sets up the mirror in your Cloudflare account.

1. Install and enable the [AI Bridge community plugin](https://community.obsidian.md/plugins/ai-bridge) in the vault you want to use.
2. Download the Windows x64 ZIP, extract it completely and open `ContextAnywhere.exe`. [Download the Windows wizard](https://github.com/uid21/Context-Anywhere/releases?q=windows-setup)
3. Choose your local vault, sign in to Cloudflare and select the notes or folders to share. Create a mirror on first use, or restore your existing deployment on a new computer. With Obsidian open, select **Import into Obsidian** and check the first sync.
4. In **Connect your AI**, copy the address ending in `/mcp`. Add it as a remote MCP server in your AI client, choose OAuth and enter the read password on your mirror’s authorization page. Try asking for a note you just synced.

**Using Gemini?** On the web, open Connected Apps, add a custom app and paste the MCP URL. Leave Client ID and Client secret blank. If you don’t see custom apps, check Google’s account and region requirements. [Gemini setup and availability](https://support.google.com/gemini/answer/17209137)

[Windows setup, recovery and password management](installer/README.md#english) · [Manual setup for macOS, Linux or the command line](docs/manual-setup.md)

## What gets shared?

- **You choose the scope.** Start with a folder or select the whole vault. If you enable attachments, AI Bridge syncs supported files referenced by eligible notes. You can keep a separate AI mirror alongside an encrypted primary vault.
- **AI access is read-only.** Your AI can search notes, read their contents and access permitted attachments. To save an answer, ask for an `obsidian://` link. Opening it lets Obsidian write the note on your device.
- **Your other devices can sync too.** By default, Obsidian uploads to the mirror. To download your selected notes on another device, enable AI Bridge there, import an encrypted settings link and turn on two-way sync. When edits conflict, the older copy is kept locally in `AI Bridge Conflicts`.

Cloudflare bills for usage above its free allowances. [Workers and KV pricing](https://developers.cloudflare.com/workers/platform/pricing/) · [R2 pricing](https://developers.cloudflare.com/r2/pricing/)

Licensed under [PolyForm Noncommercial 1.0.0](LICENSE).
