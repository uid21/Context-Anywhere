const pending = new WeakMap();
const normalizePath = (value) => String(value || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();

// Local setup is a one-use handoff inside the selected vault's plugin folder.
// The URI contains only a random handle, never the upload credential.
export async function consumeSetupImport(adapter, configDir, params, now = Date.now()) {
  if (params.v !== "1" || !/^[a-f0-9]{48}$/.test(params.id || "")) throw new Error("Invalid setup link.");
  const vaultPath = normalizePath(adapter.getBasePath?.());
  if (!vaultPath || normalizePath(params.path) !== vaultPath) throw new Error("Open the vault selected in the setup wizard.");
  let active = pending.get(adapter);
  if (!active) { active = new Set(); pending.set(adapter, active); }
  if (active.has(params.id)) throw new Error("Setup import is already in progress.");
  active.add(params.id);
  const file = `${configDir}/plugins/ai-bridge/setup-${params.id}.json`;
  try {
    const record = JSON.parse(await adapter.read(file));
    if (record.version !== 1 || normalizePath(record.vaultPath) !== vaultPath) throw new Error("Setup belongs to another vault.");
    if (!Number.isFinite(record.expiresAt) || record.expiresAt <= now || record.expiresAt > now + 120_000) {
      await adapter.remove(file);
      throw new Error("Setup link expired. Return to the wizard and import again.");
    }
    const settings = record.settings;
    if (!settings || !/^https:\/\/[a-z0-9.-]+\.workers\.dev$/.test(settings.workerUrl || "")
      || typeof settings.token !== "string" || settings.token.length < 20
      || !Array.isArray(settings.includePrefixes) || settings.includePrefixes.some((prefix) => typeof prefix !== "string" || prefix.split(/[\\/]/).some((part) => part === ".." || part === "."))) {
      throw new Error("Invalid setup settings.");
    }
    await adapter.remove(file);
    return { ...settings, installerSetup: true };
  } finally { active.delete(params.id); }
}
