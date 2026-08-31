import test from "node:test";
import assert from "node:assert/strict";
import { isConfigPath, normalizePrefix, shouldMirrorPath } from "../src/rules.js";

test("empty folder list mirrors every Markdown note", () => {
  assert.equal(shouldMirrorPath("Daily/2026-08-29.md", []), true);
  assert.equal(shouldMirrorPath("Projects/App/README.md", ["", "  "]), true);
  assert.equal(shouldMirrorPath("image.png", []), false);
});

test("configured folders include descendants but not unrelated notes", () => {
  assert.equal(shouldMirrorPath("Daily/2026-08-29.md", ["Daily"]), true);
  assert.equal(shouldMirrorPath("Daily.md", ["Daily"]), true);
  assert.equal(shouldMirrorPath("Projects/App/README.md", ["Daily"]), false);
});

test(".obsidian is always excluded, case-insensitively", () => {
  assert.equal(shouldMirrorPath(".obsidian/plugins/test.md", []), false);
  assert.equal(shouldMirrorPath(".Obsidian/secret.md", []), false);
  assert.equal(isConfigPath(".OBSIDIAN\\plugins\\data.json"), true);
  assert.equal(isConfigPath(".config\\plugins\\data.json", ".config"), true);
});

test("visible AI Bridge conflict copies are never mirrored back", () => {
  assert.equal(shouldMirrorPath("AI Bridge Conflicts/Journal/day (conflict).md", []), false);
});

test("folder prefixes are normalized", () => {
  assert.equal(normalizePrefix(" /Daily\\assets/ "), "Daily/assets");
});
