## Windows setup 1.1.1

- Ship the Worker with MCP TypeScript SDK 2.4.0, which updates the bundled URI validator.
- Build with the upstream Wrangler and Miniflare security updates and Undici 7.30.2. Keep Node.js 22.23.5 and AI Bridge 0.4.3.

## Windows setup 1.1.0

- Add Gemini to the connection wizard. New mirrors start with one read password. Add named passwords per service, recover Dashboard-created passwords on another device, and choose which one to use for each AI.
- Restore a mirror without choosing a local vault. Setup can recover from an unreadable Windows credential record, reconnect its backend and bring an existing window forward on a second launch.
- The Worker maintains an encrypted record of its current read passwords. The wizard can also register an existing manually deployed mirror. Updating an existing Worker preserves its live secrets.
- Include Node.js 22.23.5 and AI Bridge 0.4.3. Individual Markdown notes picked in the wizard now match the same paths in the plugin.
