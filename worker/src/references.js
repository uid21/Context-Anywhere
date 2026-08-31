function cleanRelativePath(path) {
  if (typeof path !== "string") return null;
  const value = path.replace(/\\/g, "/").replace(/^\/+/, "").trim();
  if (!value || value.includes("\0")) return null;
  const parts = value.split("/");
  if (parts.some((part) => !part || part === "." || part === ".." || part.startsWith("."))) return null;
  return parts.join("/");
}

function decodeLink(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function resolveReference(reference, notePath) {
  let value = decodeLink(reference.trim())
    .replace(/^<|>$/g, "")
    .split("|")[0]
    .split("#")[0]
    .trim();
  if (!value || /^[a-z][a-z0-9+.-]*:/i.test(value)) return null;
  value = value.replace(/\\/g, "/");

  const noteParts = notePath.split("/");
  noteParts.pop();
  const sourceParts = value.startsWith("/") ? [] : noteParts;
  const parts = [...sourceParts];
  for (const part of value.replace(/^\/+/, "").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) return null;
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return cleanRelativePath(parts.join("/"));
}

export function noteReferencesAsset(content, notePath, assetPath) {
  const references = [];
  for (const match of content.matchAll(/!?\[\[([^\]]+)\]\]/g)) references.push(match[1]);
  for (const match of content.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
    const raw = match[1].trim();
    references.push(raw.startsWith("<") ? raw.slice(1, raw.indexOf(">")) : raw.split(/\s+["']/)[0]);
  }

  const target = assetPath.toLowerCase();
  const targetName = target.slice(target.lastIndexOf("/") + 1);
  return references.some((reference) => {
    const resolved = resolveReference(reference, notePath)?.toLowerCase();
    if (resolved === target) return true;
    const raw = decodeLink(reference).split("|")[0].split("#")[0].replace(/\\/g, "/").toLowerCase();
    return !raw.includes("/") && raw === targetName;
  });
}
