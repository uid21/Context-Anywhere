import assert from "node:assert/strict";
import test from "node:test";
import { noteReferencesAsset } from "../src/references.js";

test("accepts an Obsidian attachment basename", () => {
  assert.equal(
    noteReferencesAsset("截图：![[phone-shot.png]]", "40-日记/2026-08-29.md", "attachments/phone-shot.png"),
    true,
  );
});

test("resolves a relative Markdown attachment path", () => {
  assert.equal(
    noteReferencesAsset("![diagram](../attachments/diagram.webp)", "10-项目/demo/plan.md", "10-项目/attachments/diagram.webp"),
    true,
  );
});

test("decodes URL-encoded Markdown attachment paths", () => {
  assert.equal(
    noteReferencesAsset("![receipt](<../../attachments/八月%20收据.jpg>)", "40-日记/2026/08/29.md", "40-日记/attachments/八月 收据.jpg"),
    true,
  );
});

test("does not treat an external URL as a mirrored attachment", () => {
  assert.equal(
    noteReferencesAsset("![remote](https://example.com/a.png)", "40-日记/2026-08-29.md", "attachments/a.png"),
    false,
  );
});
