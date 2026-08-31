const CONFLICT_ROOT = "AI Bridge Conflicts";

function versionChanged(remote, tombstone, base = {}) {
  const current = tombstone && (!remote || tombstone.version >= remote.version) ? tombstone : remote;
  if (!current) return Boolean(base.remoteVersion || base.remoteHash);
  return Number(current.version || 0) !== Number(base.remoteVersion || 0)
    || String(current.hash || "") !== String(base.remoteHash || "")
    || Boolean(tombstone && current === tombstone) !== Boolean(base.remoteDeleted);
}

function remoteSnapshot(remote, tombstone) {
  if (tombstone && (!remote || Number(tombstone.version || 0) >= Number(remote.version || 0))) {
    return { ...tombstone, deleted: true };
  }
  return remote ? { ...remote, deleted: false } : null;
}

function decideSyncAction({ local, remote, tombstone, base }) {
  const cloud = remoteSnapshot(remote, tombstone);
  const localExists = Boolean(local);
  const remoteExists = Boolean(cloud && !cloud.deleted);

  if (localExists && remoteExists && local.hash === cloud.hash) {
    return { action: "record", conflict: false, cloud };
  }

  if (!base) {
    if (localExists && remoteExists) {
      const localWins = Number(local.mtime || 0) >= Number(cloud.mtime || 0);
      return {
        action: localWins ? "upload" : "download",
        conflict: true,
        loser: localWins ? "remote" : "local",
        cloud,
      };
    }
    if (localExists && cloud?.deleted) {
      const localWins = Number(local.mtime || 0) >= Number(cloud.mtime || 0);
      return {
        action: localWins ? "upload" : "deleteLocal",
        conflict: !localWins,
        loser: localWins ? null : "local",
        cloud,
      };
    }
    if (localExists) return { action: "upload", conflict: false, cloud };
    if (remoteExists) return { action: "download", conflict: false, cloud };
    return { action: "record", conflict: false, cloud };
  }

  const localDeleted = !localExists && Boolean(base.localDeletedAt);
  if (!localExists && remoteExists && !localDeleted) {
    return { action: "download", conflict: false, cloud };
  }

  const localChanged = localExists
    ? String(local.hash || "") !== String(base.localHash || "")
    : localDeleted;
  const cloudChanged = versionChanged(remote, tombstone, base);

  if (!localChanged && !cloudChanged) return { action: "record", conflict: false, cloud };
  if (localChanged && !cloudChanged) {
    return { action: localExists ? "upload" : "deleteRemote", conflict: false, cloud };
  }
  if (!localChanged && cloudChanged) {
    return { action: remoteExists ? "download" : "deleteLocal", conflict: false, cloud };
  }

  const localMtime = Number(local?.mtime || base.localDeletedAt || Date.now());
  const cloudMtime = Number(cloud?.mtime || 0);
  const localWins = localMtime >= cloudMtime;
  if (localWins) {
    return {
      action: localExists ? "upload" : "deleteRemote",
      conflict: remoteExists,
      loser: remoteExists ? "remote" : null,
      cloud,
    };
  }
  return {
    action: remoteExists ? "download" : "deleteLocal",
    conflict: localExists,
    loser: localExists ? "local" : null,
    cloud,
  };
}

function safeSegment(value, fallback = "device") {
  const cleaned = String(value || "")
    .split("")
    .map((character) => (character.charCodeAt(0) < 32 ? "-" : character))
    .join("")
    .replace(/[<>:"/\\|?*]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || fallback;
}

function conflictTimestamp(timestamp) {
  return new Date(Number(timestamp) || Date.now()).toISOString().replace(/[:.]/g, "-");
}

function makeConflictPath(originalPath, sourceDevice, timestamp = Date.now()) {
  const normalized = String(originalPath || "").replace(/\\/g, "/").replace(/^\/+/, "");
  const slash = normalized.lastIndexOf("/");
  const directory = slash >= 0 ? normalized.slice(0, slash) : "";
  const filename = slash >= 0 ? normalized.slice(slash + 1) : normalized;
  const dot = filename.lastIndexOf(".");
  const stem = dot > 0 ? filename.slice(0, dot) : filename;
  const extension = dot > 0 ? filename.slice(dot) : "";
  const conflictName = `${safeSegment(stem, "file")} (conflict from ${safeSegment(sourceDevice)} ${conflictTimestamp(timestamp)})${extension}`;
  return [CONFLICT_ROOT, directory, conflictName].filter(Boolean).join("/");
}

function stateFrom(local, cloud) {
  return {
    localHash: local?.hash || null,
    remoteHash: cloud?.deleted ? null : cloud?.hash || null,
    remoteVersion: Number(cloud?.version || 0),
    remoteDeleted: Boolean(cloud?.deleted),
    remoteMtime: Number(cloud?.mtime || 0),
  };
}

export {
  CONFLICT_ROOT,
  decideSyncAction,
  makeConflictPath,
  remoteSnapshot,
  stateFrom,
};
