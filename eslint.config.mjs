import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  ...obsidianmd.configs.recommended,
  {
    ignores: ["main.js", "node_modules/**"],
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["src/*.js"],
        },
      },
    },
  },
  {
    files: ["src/i18n.js", "src/rules.js"],
    rules: {
      // `.obsidian` is an explicit permanent deny rule and is also documented in the UI.
      // The runtime additionally blocks Vault.configDir when the user has customized it.
      "obsidianmd/hardcoded-config-path": "off",
    },
  },
  {
    files: ["src/main.js"],
    rules: {
      // Keep the imperative settings UI so the plugin remains compatible with Obsidian 1.8.7.
      "obsidianmd/settings-tab/prefer-setting-definitions": "off",
    },
  },
]);
