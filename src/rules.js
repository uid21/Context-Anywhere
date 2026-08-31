function normalizePrefix(value) {
  return String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");
}

function isPathInside(path, directory) {
  const normalized = String(path || "").replace(/\\/g, "/").toLowerCase();
  const normalizedDirectory = normalizePrefix(directory).toLowerCase();
  return Boolean(normalizedDirectory)
    && (normalized === normalizedDirectory || normalized.startsWith(`${normalizedDirectory}/`));
}

function isConfigPath(path, configDir = ".obsidian") {
  // `.obsidian` stays blocked even when the vault uses a custom configuration directory.
  return isPathInside(path, ".obsidian") || isPathInside(path, configDir);
}

function isConflictPath(path) {
  return isPathInside(path, "AI Bridge Conflicts");
}

function shouldMirrorPath(path, includePrefixes = [], configDir = ".obsidian") {
  const normalized = String(path || "").replace(/\\/g, "/");
  if (!normalized.toLowerCase().endsWith(".md") || isConfigPath(normalized, configDir) || isConflictPath(normalized)) return false;

  const prefixes = Array.isArray(includePrefixes)
    ? includePrefixes.map(normalizePrefix).filter(Boolean)
    : [];
  if (prefixes.length === 0) return true;

  return prefixes.some((prefix) => normalized === `${prefix}.md` || normalized.startsWith(`${prefix}/`));
}

export { isConfigPath, isConflictPath, normalizePrefix, shouldMirrorPath };
