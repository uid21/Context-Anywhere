# Deploy the mirror from the command line

[中文](manual-setup.zh-CN.md) · [Project overview](../README.md)

Use this route on macOS or Linux, or when you want to manage the Worker yourself. Windows users can complete the same setup with the [portable wizard](../installer/README.md#english).

## Create the mirror

1. Enable R2 in your Cloudflare account. Download or clone this repository. Install the Node.js version in [`.node-version`](../.node-version), then open a terminal at the repository root.
2. Install the Worker dependencies and sign in. Check that the account shown by `whoami` is the account you want to use.

   ```sh
   cd worker
   npm ci
   npm run wrangler -- login
   npm run wrangler -- whoami
   ```

3. Choose unique names for the Worker, a dedicated R2 bucket for mirrored content and a KV namespace for OAuth. Replace the example resource names in these commands and keep the namespace ID returned by the second command.

   ```sh
   npm run wrangler -- r2 bucket create my-notes-mirror
   npm run wrangler -- kv namespace create my-notes-oauth
   ```

4. Copy `wrangler.example.toml` to `wrangler.toml`. Set `name` to the Worker name, set `bucket_name` under `AI_MIRROR` to the new bucket, and set `id` under `OAUTH_KV` to the namespace ID. Keep the binding names as supplied. Deploy and save the resulting HTTPS URL.

   ```sh
   npm run wrangler -- deploy --config wrangler.toml
   ```

5. Make a separate random value for each secret. Run this once per value and save them in your password manager. Paste each value into the corresponding Wrangler prompt.

   ```sh
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
   npm run wrangler -- secret put MIRROR_TOKEN --config wrangler.toml
   npm run wrangler -- secret put MIRROR_READ_KEY --config wrangler.toml
   ```

   `MIRROR_TOKEN` is the upload credential for Obsidian. `MIRROR_READ_KEY` is the password you enter on your mirror’s OAuth page. To give a service its own read password, generate a fresh value and choose an unused name. For example, run `npm run wrangler -- secret put MIRROR_READ_KEY_17 --config wrangler.toml`. Numeric suffixes start at 2 and may skip numbers. Existing passwords continue to work. Keep all passwords out of `wrangler.toml`.

## Sync a note and read it from your AI

1. Install and enable [AI Bridge](https://community.obsidian.md/plugins/ai-bridge) in your vault. In its settings, enter the Worker root URL (for example, `https://my-mirror.example.workers.dev`) and the upload token. Specify the folders or notes to share, one vault-relative path per line. An empty list includes all eligible Markdown notes.
2. Test the connection and run a full sync. To include attachments, enable attachment sync. The Worker lets AI read supported images and allows PDFs when the referring note opts in with `ai-attachments: true` in its frontmatter.
3. In your AI client, add the Worker URL **with `/mcp` appended**, choose OAuth and enter a read password on the mirror’s authorization page. Ask for a note you just synced. [Connecting Gemini](https://support.google.com/gemini/answer/17209137)

To enable recovery for a manually deployed mirror, sign in to the Windows wizard, choose the manual deployment option and supply the Worker name and AI Bridge upload credential. Once registered, the Worker backs up the active read passwords and another computer can retrieve them through the wizard. [Recovery and changing passwords](../installer/README.md#english)
