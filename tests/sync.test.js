import test from "node:test";
import assert from "node:assert/strict";
import { decideSyncAction, makeConflictPath } from "../src/sync.js";

test("remote-only note downloads to a new device", () => {
  const result = decideSyncAction({
    local: null,
    remote: { hash: "remote", mtime: 20, version: 1 },
    tombstone: null,
    base: null,
  });
  assert.equal(result.action, "download");
  assert.equal(result.conflict, false);
});

test("local-only note uploads from a new device", () => {
  const result = decideSyncAction({
    local: { hash: "local", mtime: 20 },
    remote: null,
    tombstone: null,
    base: null,
  });
  assert.equal(result.action, "upload");
});

test("both changed and later local version wins with remote conflict copy", () => {
  const result = decideSyncAction({
    local: { hash: "local-new", mtime: 300 },
    remote: { hash: "remote-new", mtime: 200, version: 2 },
    tombstone: null,
    base: { localHash: "base", remoteHash: "base", remoteVersion: 1 },
  });
  assert.deepEqual({ action: result.action, conflict: result.conflict, loser: result.loser }, {
    action: "upload",
    conflict: true,
    loser: "remote",
  });
});

test("both changed and later remote version wins with local conflict copy", () => {
  const result = decideSyncAction({
    local: { hash: "local-new", mtime: 200 },
    remote: { hash: "remote-new", mtime: 300, version: 2 },
    tombstone: null,
    base: { localHash: "base", remoteHash: "base", remoteVersion: 1 },
  });
  assert.deepEqual({ action: result.action, conflict: result.conflict, loser: result.loser }, {
    action: "download",
    conflict: true,
    loser: "local",
  });
});

test("remote deletion removes an unchanged local note", () => {
  const result = decideSyncAction({
    local: { hash: "base", mtime: 100 },
    remote: null,
    tombstone: { mtime: 200, version: 2 },
    base: { localHash: "base", remoteHash: "base", remoteVersion: 1 },
  });
  assert.equal(result.action, "deleteLocal");
  assert.equal(result.conflict, false);
});

test("a temporarily missing local file is restored instead of deleting cloud data", () => {
  const result = decideSyncAction({
    local: null,
    remote: { hash: "base", mtime: 100, version: 1 },
    tombstone: null,
    base: { localHash: "base", remoteHash: "base", remoteVersion: 1 },
  });
  assert.equal(result.action, "download");
  assert.equal(result.conflict, false);
});

test("an explicit local deletion still deletes the remote copy", () => {
  const result = decideSyncAction({
    local: null,
    remote: { hash: "base", mtime: 100, version: 1 },
    tombstone: null,
    base: { localHash: "base", remoteHash: "base", remoteVersion: 1, localDeletedAt: 200 },
  });
  assert.equal(result.action, "deleteRemote");
  assert.equal(result.conflict, false);
});

test("conflict path is obvious and names its source device", () => {
  const path = makeConflictPath("Journal/day.md", "Phone/A", Date.UTC(2026, 7, 31, 1, 2, 3));
  assert.match(path, /^AI Bridge Conflicts\/Journal\/day \(conflict from Phone-A 2026-08-31T01-02-03-/);
  assert.match(path, /\.md$/);
});
