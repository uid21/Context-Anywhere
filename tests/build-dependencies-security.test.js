import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import Module, { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
const braces = Object.keys(lock.packages).filter((name) => name.endsWith("node_modules/brace-expansion"));

for (const installedPath of braces) {
  test(`${installedPath}: ordinary globs work and hostile brace patterns cannot exhaust the stack or stall`, () => {
    // Keep CPU/stack attack probes in a bounded child. A regression must fail
    // this check instead of hanging the entire test runner.
    const result = spawnSync(process.execPath, ["--input-type=commonjs", "--eval", `
      const assert = require('node:assert/strict');
      const imported = require(process.argv[1]);
      const expand = typeof imported === 'function' ? imported : imported.expand;
      assert.deepEqual(expand('file-{a,b}-{1..2}.js'), ['file-a-1.js', 'file-a-2.js', 'file-b-1.js', 'file-b-2.js']);
      const attacks = [
        '{'.repeat(5000) + 'a,b' + '}'.repeat(5000),
        '{' + '{x,y},'.repeat(10000) + 'z}',
        '{a}' + '}'.repeat(100000) + ',z}'
      ];
      for (const pattern of attacks) assert.ok(Array.isArray(expand(pattern)));
      console.log('bounded expansion passed');
    `, resolve(root, installedPath)], { encoding: "utf8", timeout: 8000, windowsHide: true });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  });
}

test("URI helpers reject port injection and malformed hosts, and normalize encoded host case", () => {
  const uri = require("fast-uri");
  assert.throws(() => uri.serialize({ scheme: "http", host: "trusted.example", port: "@127.0.0.1:8124", path: "/app" }), /port is malformed/);
  assert.match(uri.parse("http://[example.com/").error, /host is malformed/);
  assert.equal(uri.parse("//%41.com").host, "a.com");
  assert.equal(uri.equal("//%41.com", "//a.com"), true);
  assert.equal(uri.serialize({ scheme: "https", host: "example.com", port: 443, path: "/schema" }), "https://example.com/schema");
});

test("Moment refuses an object disguised as a locale without loading a path outside its locale directory", () => {
  const moment = require("moment");
  const originalLoad = Module._load;
  const escapedLoads = [];
  Module._load = function (name, ...rest) {
    if (name.startsWith("./locale/") && name.includes("..")) {
      escapedLoads.push(name);
      return {};
    }
    return originalLoad.call(this, name, ...rest);
  };
  try {
    moment.locale({
      match() { return ["accepted"]; },
      toString() { return "../../outside-controlled-test"; },
      toLowerCase() { return "en"; },
    });
    assert.deepEqual(escapedLoads, []);
    moment.locale("en");
    assert.equal(moment.utc("2026-10-22T00:00:00Z").format("YYYY-MM-DD"), "2026-10-22");
  } finally {
    Module._load = originalLoad;
  }
});
