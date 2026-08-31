import test from "node:test";
import assert from "node:assert/strict";
import { createTranslator, detectLocale, resolveLocale, STRINGS } from "../src/i18n.js";

test("supported Obsidian languages map to their translations", () => {
  assert.equal(resolveLocale("zh-CN"), "zh");
  assert.equal(resolveLocale("fr-FR"), "fr");
  assert.equal(resolveLocale("es-ES"), "es");
  assert.equal(resolveLocale("ja-JP"), "ja");
});

test("unsupported or unavailable languages fall back to English", () => {
  assert.equal(resolveLocale("de-DE"), "en");
  assert.equal(detectLocale(() => { throw new Error("unavailable"); }), "en");
  assert.equal(createTranslator("de-DE")("testConnection.button"), "Test");
});

test("every locale contains every English UI key", () => {
  const englishKeys = Object.keys(STRINGS.en).sort();
  for (const [locale, strings] of Object.entries(STRINGS)) {
    assert.deepEqual(Object.keys(strings).sort(), englishKeys, `${locale} has a missing or extra UI key`);
  }
});

test("translated placeholders are interpolated", () => {
  assert.equal(createTranslator("zh-CN")("maxAttachment.desc", { limit: 8 }).includes("8 MB"), true);
});
