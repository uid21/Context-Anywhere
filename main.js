var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.js
var main_exports = {};
__export(main_exports, {
  default: () => main_default
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");

// src/i18n.js
var STRINGS = {
  en: {
    "command.fullSync": "Run a full AI Mirror sync now",
    "settings.intro": "Only Markdown files are mirrored. When folders are specified, only those folders are synced; leave the list empty to sync the entire vault. Attachments must be referenced by those notes and attachment syncing must be enabled separately. The .obsidian folder is never uploaded.",
    "workerUrl.name": "Worker URL",
    "workerUrl.desc": "Enter the HTTPS endpoint for your compatible AI Bridge service.",
    "workerUrl.placeholder": "Enter your HTTPS endpoint",
    "writeToken.name": "Write token",
    "writeToken.desc": "Stored only in this plugin's local settings. It is never logged or included as plaintext in an export link.",
    "allowedFolders.name": "Folders to mirror",
    "allowedFolders.desc": "One vault-relative path per line. Subfolders are included automatically. Leave empty to sync the entire vault; .obsidian is always excluded.",
    "twoWay.name": "Two-way sync",
    "twoWay.desc": "Off by default. When enabled, startup, file changes, scheduled runs, and Sync now upload and download. If both sides changed, the later modification wins and the older version is saved under AI Bridge Conflicts.",
    "deviceName.name": "This device name",
    "deviceName.desc": "Used in conflict-copy filenames so you can immediately see where the older version came from.",
    "twoWay.status.name": "Two-way sync status",
    "twoWay.status.desc": "Last successful run: {time}. Conflicts in that run: {conflicts}.",
    "twoWay.status.lastConflict": "Latest conflict copy: {path}",
    "twoWay.never": "Never",
    "syncOnChange.name": "Sync when files change",
    "syncOnChange.desc": "Upload a note after it is created or modified.",
    "scheduledSync.name": "Independent scheduled incremental sync",
    "scheduledSync.desc": "Runs only while Obsidian is open, at the interval you set. Only content changed since the last successful sync is uploaded.",
    "scheduledInterval.name": "Scheduled sync interval (minutes)",
    "scheduledInterval.desc": "From 1 to 1440 minutes. The default is 15 minutes.",
    "attachments.name": "Upload note attachments",
    "attachments.desc": "When enabled, referenced images in mirrored notes are uploaded. For PDFs, add ai-attachments: true to the note's frontmatter.",
    "maxAttachment.name": "Maximum size per attachment (MB)",
    "maxAttachment.desc": "Default: 8 MB. The current service limit is {limit} MB.",
    "testConnection.name": "Test connection",
    "testConnection.button": "Test",
    "fullSync.name": "Run a full sync now",
    "fullSync.desc": "With two-way sync off, recheck and upload every mirrored note. With it on, run a complete upload-and-download pass. Attachments are included when enabled.",
    "fullSync.button": "Sync now",
    "transfer.heading": "Transfer settings to iPhone / iPad",
    "transfer.intro": "The export link contains the endpoint, write token, and settings on this page, all encrypted with a separate transfer password. Do not reuse the service token as the transfer password.",
    "transfer.create.name": "Create an encrypted settings link",
    "transfer.create.desc": "The link is copied to the clipboard. Paste it into AI Bridge settings on iOS, or open the link directly.",
    "transfer.create.button": "Create and copy",
    "transfer.create.modalTitle": "Create an encrypted settings link",
    "transfer.create.modalDesc": "Choose a temporary transfer password with at least 8 characters. You will enter it again when importing on iOS.",
    "transfer.create.submit": "Encrypt and copy",
    "transfer.import.name": "Import from an encrypted settings link",
    "transfer.import.desc": "On iOS, paste the obsidian:// link created on your computer.",
    "transfer.import.button": "Paste link",
    "transfer.import.modalTitle": "Paste an AI Bridge settings link",
    "transfer.import.continue": "Continue",
    "passphrase.label": "Transfer password",
    "passphrase.repeat": "Enter it again",
    "button.cancel": "Cancel",
    "button.importAnyway": "Import anyway",
    "notice.configFirst": "AI Bridge: enter the endpoint and write token first",
    "notice.syncRunning": "AI Bridge: a sync is already running",
    "notice.connectionSuccess": "AI Bridge: connection successful",
    "notice.linkCopied": "AI Bridge: encrypted settings link copied",
    "notice.imported": "AI Bridge: settings imported securely",
    "notice.pasteFirst": "Paste the settings link first",
    "notice.passphraseShort": "The transfer password must contain at least 8 characters",
    "notice.passphraseMismatch": "The transfer passwords do not match",
    "error.unconfigured": "AI Bridge is not configured",
    "error.configureFirst": "Please complete the endpoint and write token settings first",
    "error.invalidLinkFormat": "The settings link format is invalid",
    "error.copyFailed": "Could not copy to the clipboard",
    "error.notSettingsLink": "This is not an AI Bridge settings link",
    "error.unsupportedLinkVersion": "This settings link version is not supported",
    "error.incompleteLink": "The settings link is incomplete",
    "error.decryptFailed": "The transfer password is incorrect, or the settings link is corrupted",
    "error.attachmentUploadFailed": "Attachment {path} upload failed: HTTP {status}",
    "confirm.differentVault.title": "Different vault names",
    "confirm.differentVault.message": "The link comes from \u201C{sourceVault}\u201D, while the current vault is \u201C{currentVault}\u201D. Import anyway?",
    "modal.import.title": "Import AI Bridge settings",
    "modal.import.description": "Enter the transfer password used when the link was created. This is not the service write token.",
    "modal.import.submit": "Decrypt and import",
    "generic.errorPrefix": "AI Bridge: {message}",
    "sync.summary": "AI Bridge: {notes} notes synced{details}{failures}",
    "sync.attachmentsDetail": ", {count} attachments",
    "sync.skippedDetail": ", {count} over-limit attachments skipped",
    "sync.failedDetail": ", {count} failed",
    "twoWay.summary": "AI Bridge two-way sync: {uploaded} uploaded, {downloaded} downloaded, {conflicts} conflicts. Older versions are kept in AI Bridge Conflicts."
  },
  zh: {
    "command.fullSync": "\u7ACB\u5373\u5B8C\u6574\u540C\u6B65 AI Mirror",
    "settings.intro": "\u53EA\u955C\u50CF Markdown \u6587\u4EF6\u3002\u586B\u5199\u6587\u4EF6\u5939\u65F6\u4EC5\u540C\u6B65\u8FD9\u4E9B\u6587\u4EF6\u5939\uFF1B\u7559\u7A7A\u5219\u540C\u6B65\u6574\u4E2A\u4ED3\u5E93\u3002\u9644\u4EF6\u5FC5\u987B\u88AB\u8FD9\u4E9B\u7B14\u8BB0\u5B9E\u9645\u5F15\u7528\uFF0C\u5E76\u4E14\u9700\u8981\u5355\u72EC\u5F00\u542F\u9644\u4EF6\u540C\u6B65\u3002.obsidian \u6587\u4EF6\u5939\u6C38\u8FDC\u4E0D\u4F1A\u4E0A\u4F20\u3002",
    "workerUrl.name": "Worker \u5730\u5740",
    "workerUrl.desc": "\u586B\u5199\u4E0E AI Bridge \u517C\u5BB9\u670D\u52A1\u7684 HTTPS \u63A5\u53E3\u5730\u5740\u3002",
    "workerUrl.placeholder": "\u586B\u5199 HTTPS \u63A5\u53E3\u5730\u5740",
    "writeToken.name": "\u5199\u5165\u4EE4\u724C",
    "writeToken.desc": "\u53EA\u4FDD\u5B58\u5728\u672C\u63D2\u4EF6\u7684\u672C\u5730\u8BBE\u7F6E\u4E2D\uFF0C\u4E0D\u4F1A\u5199\u5165\u65E5\u5FD7\uFF0C\u4E5F\u4E0D\u4F1A\u4EE5\u660E\u6587\u653E\u8FDB\u5BFC\u51FA\u94FE\u63A5\u3002",
    "allowedFolders.name": "\u8981\u955C\u50CF\u7684\u6587\u4EF6\u5939",
    "allowedFolders.desc": "\u6BCF\u884C\u586B\u5199\u4E00\u4E2A\u4ED3\u5E93\u5185\u76F8\u5BF9\u8DEF\u5F84\uFF0C\u5B50\u6587\u4EF6\u5939\u4F1A\u81EA\u52A8\u5305\u542B\u3002\u7559\u7A7A\u5219\u540C\u6B65\u6574\u4E2A\u4ED3\u5E93\uFF1B.obsidian \u59CB\u7EC8\u6392\u9664\u3002",
    "twoWay.name": "\u53CC\u5411\u540C\u6B65",
    "twoWay.desc": "\u9ED8\u8BA4\u5173\u95ED\u3002\u5F00\u542F\u540E\uFF0CObsidian \u542F\u52A8\u3001\u6587\u4EF6\u53D8\u5316\u3001\u5B9A\u65F6\u4EFB\u52A1\u548C\u201C\u7ACB\u5373\u540C\u6B65\u201D\u90FD\u4F1A\u540C\u65F6\u4E0A\u4F20\u548C\u4E0B\u8F7D\u3002\u4E24\u8FB9\u90FD\u4FEE\u6539\u65F6\uFF0C\u4EE5\u4FEE\u6539\u65F6\u95F4\u66F4\u665A\u7684\u7248\u672C\u4E3A\u51C6\uFF0C\u8F83\u65E9\u7248\u672C\u4FDD\u5B58\u5728\u201CAI Bridge Conflicts\u201D\u6587\u4EF6\u5939\u3002",
    "deviceName.name": "\u672C\u8BBE\u5907\u540D\u79F0",
    "deviceName.desc": "\u4F1A\u5199\u8FDB\u51B2\u7A81\u526F\u672C\u7684\u6587\u4EF6\u540D\uFF0C\u8BA9\u4F60\u4E00\u773C\u770B\u51FA\u8F83\u65E9\u7248\u672C\u6765\u81EA\u54EA\u53F0\u8BBE\u5907\u3002",
    "twoWay.status.name": "\u53CC\u5411\u540C\u6B65\u72B6\u6001",
    "twoWay.status.desc": "\u4E0A\u6B21\u6210\u529F\uFF1A{time}\u3002\u90A3\u6B21\u53D1\u73B0\u51B2\u7A81\uFF1A{conflicts} \u4E2A\u3002",
    "twoWay.status.lastConflict": "\u6700\u8FD1\u51B2\u7A81\u526F\u672C\uFF1A{path}",
    "twoWay.never": "\u5C1A\u672A\u8FD0\u884C",
    "syncOnChange.name": "\u6587\u4EF6\u53D8\u5316\u65F6\u540C\u6B65",
    "syncOnChange.desc": "\u7B14\u8BB0\u521B\u5EFA\u6216\u4FEE\u6539\u540E\u81EA\u52A8\u4E0A\u4F20\u3002",
    "scheduledSync.name": "\u72EC\u7ACB\u5B9A\u65F6\u589E\u91CF\u540C\u6B65",
    "scheduledSync.desc": "\u53EA\u5728 Obsidian \u6253\u5F00\u65F6\u6309\u8BBE\u5B9A\u95F4\u9694\u8FD0\u884C\uFF0C\u5E76\u4E14\u53EA\u4E0A\u4F20\u4E0A\u6B21\u6210\u529F\u540C\u6B65\u540E\u53D8\u5316\u7684\u5185\u5BB9\u3002",
    "scheduledInterval.name": "\u5B9A\u65F6\u540C\u6B65\u95F4\u9694\uFF08\u5206\u949F\uFF09",
    "scheduledInterval.desc": "\u53EF\u8BBE\u7F6E 1 \u5230 1440 \u5206\u949F\uFF0C\u9ED8\u8BA4 15 \u5206\u949F\u3002",
    "attachments.name": "\u4E0A\u4F20\u7B14\u8BB0\u9644\u4EF6",
    "attachments.desc": "\u5F00\u542F\u540E\u4F1A\u4E0A\u4F20\u955C\u50CF\u7B14\u8BB0\u5B9E\u9645\u5F15\u7528\u7684\u56FE\u7247\u3002PDF \u9700\u8981\u5728\u7B14\u8BB0 frontmatter \u4E2D\u52A0\u5165 ai-attachments: true\u3002",
    "maxAttachment.name": "\u5355\u4E2A\u9644\u4EF6\u6700\u5927\u5927\u5C0F\uFF08MB\uFF09",
    "maxAttachment.desc": "\u9ED8\u8BA4 8 MB\uFF1B\u5F53\u524D\u670D\u52A1\u4E0A\u9650\u4E5F\u662F {limit} MB\u3002",
    "testConnection.name": "\u6D4B\u8BD5\u8FDE\u63A5",
    "testConnection.button": "\u6D4B\u8BD5",
    "fullSync.name": "\u7ACB\u5373\u5B8C\u6574\u540C\u6B65",
    "fullSync.desc": "\u53CC\u5411\u540C\u6B65\u5173\u95ED\u65F6\uFF0C\u91CD\u65B0\u68C0\u67E5\u5E76\u4E0A\u4F20\u6240\u6709\u955C\u50CF\u7B14\u8BB0\uFF1B\u5F00\u542F\u65F6\uFF0C\u7ACB\u5373\u6267\u884C\u4E00\u6B21\u5B8C\u6574\u7684\u4E0A\u4F20\u548C\u4E0B\u8F7D\u3002\u9644\u4EF6\u5F00\u5173\u5F00\u542F\u540E\u4E5F\u4F1A\u4E00\u8D77\u5904\u7406\u3002",
    "fullSync.button": "\u7ACB\u5373\u540C\u6B65",
    "transfer.heading": "\u628A\u8BBE\u7F6E\u4F20\u5230 iPhone / iPad",
    "transfer.intro": "\u5BFC\u51FA\u94FE\u63A5\u5305\u542B\u63A5\u53E3\u5730\u5740\u3001\u5199\u5165\u4EE4\u724C\u548C\u672C\u9875\u8BBE\u7F6E\uFF0C\u5E76\u7528\u4E00\u4E2A\u5355\u72EC\u7684\u4F20\u8F93\u5BC6\u7801\u6574\u4F53\u52A0\u5BC6\u3002\u4E0D\u8981\u628A\u670D\u52A1\u4EE4\u724C\u5F53\u6210\u4F20\u8F93\u5BC6\u7801\u91CD\u590D\u4F7F\u7528\u3002",
    "transfer.create.name": "\u521B\u5EFA\u52A0\u5BC6\u8BBE\u7F6E\u94FE\u63A5",
    "transfer.create.desc": "\u94FE\u63A5\u4F1A\u590D\u5236\u5230\u526A\u8D34\u677F\u3002\u53EF\u5728 iOS \u7684 AI Bridge \u8BBE\u7F6E\u4E2D\u7C98\u8D34\uFF0C\u4E5F\u53EF\u4EE5\u76F4\u63A5\u6253\u5F00\u3002",
    "transfer.create.button": "\u521B\u5EFA\u5E76\u590D\u5236",
    "transfer.create.modalTitle": "\u521B\u5EFA\u52A0\u5BC6\u8BBE\u7F6E\u94FE\u63A5",
    "transfer.create.modalDesc": "\u8BBE\u7F6E\u4E00\u4E2A\u81F3\u5C11 8 \u4E2A\u5B57\u7B26\u7684\u4E34\u65F6\u4F20\u8F93\u5BC6\u7801\uFF1B\u5728 iOS \u5BFC\u5165\u65F6\u9700\u8981\u518D\u6B21\u8F93\u5165\u3002",
    "transfer.create.submit": "\u52A0\u5BC6\u5E76\u590D\u5236",
    "transfer.import.name": "\u4ECE\u52A0\u5BC6\u8BBE\u7F6E\u94FE\u63A5\u5BFC\u5165",
    "transfer.import.desc": "\u5728 iOS \u4E0A\u7C98\u8D34\u7535\u8111\u521B\u5EFA\u7684 obsidian:// \u94FE\u63A5\u3002",
    "transfer.import.button": "\u7C98\u8D34\u94FE\u63A5",
    "transfer.import.modalTitle": "\u7C98\u8D34 AI Bridge \u8BBE\u7F6E\u94FE\u63A5",
    "transfer.import.continue": "\u7EE7\u7EED",
    "passphrase.label": "\u4F20\u8F93\u5BC6\u7801",
    "passphrase.repeat": "\u518D\u8F93\u5165\u4E00\u6B21",
    "button.cancel": "\u53D6\u6D88",
    "button.importAnyway": "\u4ECD\u7136\u5BFC\u5165",
    "notice.configFirst": "AI Bridge\uFF1A\u8BF7\u5148\u586B\u5199\u63A5\u53E3\u5730\u5740\u548C\u5199\u5165\u4EE4\u724C",
    "notice.syncRunning": "AI Bridge\uFF1A\u5DF2\u6709\u540C\u6B65\u4EFB\u52A1\u6B63\u5728\u8FD0\u884C",
    "notice.connectionSuccess": "AI Bridge\uFF1A\u8FDE\u63A5\u6210\u529F",
    "notice.linkCopied": "AI Bridge\uFF1A\u52A0\u5BC6\u8BBE\u7F6E\u94FE\u63A5\u5DF2\u590D\u5236",
    "notice.imported": "AI Bridge\uFF1A\u8BBE\u7F6E\u5DF2\u5B89\u5168\u5BFC\u5165",
    "notice.pasteFirst": "\u8BF7\u5148\u7C98\u8D34\u8BBE\u7F6E\u94FE\u63A5",
    "notice.passphraseShort": "\u4F20\u8F93\u5BC6\u7801\u81F3\u5C11\u9700\u8981 8 \u4E2A\u5B57\u7B26",
    "notice.passphraseMismatch": "\u4E24\u6B21\u8F93\u5165\u7684\u4F20\u8F93\u5BC6\u7801\u4E0D\u4E00\u81F4",
    "error.unconfigured": "AI Bridge \u5C1A\u672A\u914D\u7F6E",
    "error.configureFirst": "\u8BF7\u5148\u5B8C\u6574\u586B\u5199\u63A5\u53E3\u5730\u5740\u548C\u5199\u5165\u4EE4\u724C",
    "error.invalidLinkFormat": "\u8BBE\u7F6E\u94FE\u63A5\u683C\u5F0F\u65E0\u6548",
    "error.copyFailed": "\u65E0\u6CD5\u590D\u5236\u5230\u526A\u8D34\u677F",
    "error.notSettingsLink": "\u8FD9\u4E0D\u662F AI Bridge \u8BBE\u7F6E\u94FE\u63A5",
    "error.unsupportedLinkVersion": "\u4E0D\u652F\u6301\u8FD9\u4E2A\u7248\u672C\u7684\u8BBE\u7F6E\u94FE\u63A5",
    "error.incompleteLink": "\u8BBE\u7F6E\u94FE\u63A5\u4E0D\u5B8C\u6574",
    "error.decryptFailed": "\u4F20\u8F93\u5BC6\u7801\u4E0D\u6B63\u786E\uFF0C\u6216\u8BBE\u7F6E\u94FE\u63A5\u5DF2\u7ECF\u635F\u574F",
    "error.attachmentUploadFailed": "\u9644\u4EF6 {path} \u4E0A\u4F20\u5931\u8D25\uFF1AHTTP {status}",
    "confirm.differentVault.title": "\u4ED3\u5E93\u540D\u79F0\u4E0D\u540C",
    "confirm.differentVault.message": "\u94FE\u63A5\u6765\u81EA\u201C{sourceVault}\u201D\uFF0C\u5F53\u524D\u4ED3\u5E93\u662F\u201C{currentVault}\u201D\u3002\u4ECD\u7136\u5BFC\u5165\u5417\uFF1F",
    "modal.import.title": "\u5BFC\u5165 AI Bridge \u8BBE\u7F6E",
    "modal.import.description": "\u8F93\u5165\u521B\u5EFA\u94FE\u63A5\u65F6\u4F7F\u7528\u7684\u4F20\u8F93\u5BC6\u7801\u3002\u5B83\u4E0D\u662F\u670D\u52A1\u7684\u5199\u5165\u4EE4\u724C\u3002",
    "modal.import.submit": "\u89E3\u5BC6\u5E76\u5BFC\u5165",
    "generic.errorPrefix": "AI Bridge\uFF1A{message}",
    "sync.summary": "AI Bridge\uFF1A\u5DF2\u540C\u6B65 {notes} \u7BC7\u7B14\u8BB0{details}{failures}",
    "sync.attachmentsDetail": "\uFF0C\u9644\u4EF6 {count} \u4E2A",
    "sync.skippedDetail": "\uFF0C{count} \u4E2A\u8D85\u51FA\u5927\u5C0F\u9650\u5236\u5DF2\u8DF3\u8FC7",
    "sync.failedDetail": "\uFF0C\u5931\u8D25 {count} \u4E2A",
    "twoWay.summary": "AI Bridge \u53CC\u5411\u540C\u6B65\uFF1A\u4E0A\u4F20 {uploaded} \u4E2A\uFF0C\u4E0B\u8F7D {downloaded} \u4E2A\uFF0C\u51B2\u7A81 {conflicts} \u4E2A\u3002\u8F83\u65E9\u7248\u672C\u5DF2\u4FDD\u5B58\u5728 AI Bridge Conflicts\u3002"
  },
  fr: {
    "command.fullSync": "Lancer maintenant une synchronisation compl\xE8te d\u2019AI Mirror",
    "settings.intro": "Seuls les fichiers Markdown sont mis en miroir. Lorsque des dossiers sont indiqu\xE9s, seuls ceux-ci sont synchronis\xE9s ; laissez la liste vide pour synchroniser tout le coffre. Les pi\xE8ces jointes doivent \xEAtre r\xE9f\xE9renc\xE9es par ces notes et leur synchronisation doit \xEAtre activ\xE9e s\xE9par\xE9ment. Le dossier .obsidian n'est jamais t\xE9l\xE9vers\xE9.",
    "workerUrl.name": "URL du Worker",
    "workerUrl.desc": "Saisissez le point de terminaison HTTPS de votre service compatible avec AI Bridge.",
    "workerUrl.placeholder": "Saisissez le point de terminaison HTTPS",
    "writeToken.name": "Jeton d\u2019\xE9criture",
    "writeToken.desc": "Stock\xE9 uniquement dans les param\xE8tres locaux de ce module. Il n\u2019est jamais journalis\xE9 ni inclus en clair dans un lien d\u2019exportation.",
    "allowedFolders.name": "Dossiers \xE0 mettre en miroir",
    "allowedFolders.desc": "Un chemin relatif au coffre par ligne. Les sous-dossiers sont inclus automatiquement. Laissez vide pour synchroniser tout le coffre ; .obsidian est toujours exclu.",
    "twoWay.name": "Synchronisation bidirectionnelle",
    "twoWay.desc": "D\xE9sactiv\xE9e par d\xE9faut. Une fois activ\xE9e, le d\xE9marrage, les modifications, la planification et le bouton de synchronisation envoient et t\xE9l\xE9chargent les fichiers. En cas de double modification, la version la plus r\xE9cente l\u2019emporte et l\u2019ancienne est conserv\xE9e dans AI Bridge Conflicts.",
    "deviceName.name": "Nom de cet appareil",
    "deviceName.desc": "Inscrit dans le nom des copies en conflit afin d\u2019identifier imm\xE9diatement leur appareil d\u2019origine.",
    "twoWay.status.name": "\xC9tat de la synchronisation bidirectionnelle",
    "twoWay.status.desc": "Derni\xE8re r\xE9ussite : {time}. Conflits lors de cette ex\xE9cution : {conflicts}.",
    "twoWay.status.lastConflict": "Derni\xE8re copie en conflit : {path}",
    "twoWay.never": "Jamais",
    "syncOnChange.name": "Synchroniser lors des modifications",
    "syncOnChange.desc": "T\xE9l\xE9verser une note apr\xE8s sa cr\xE9ation ou sa modification.",
    "scheduledSync.name": "Synchronisation incr\xE9mentielle planifi\xE9e ind\xE9pendante",
    "scheduledSync.desc": "S\u2019ex\xE9cute uniquement lorsque Obsidian est ouvert, selon l\u2019intervalle d\xE9fini. Seul le contenu modifi\xE9 depuis la derni\xE8re synchronisation r\xE9ussie est t\xE9l\xE9vers\xE9.",
    "scheduledInterval.name": "Intervalle de synchronisation planifi\xE9e (minutes)",
    "scheduledInterval.desc": "De 1 \xE0 1 440 minutes. Valeur par d\xE9faut : 15 minutes.",
    "attachments.name": "T\xE9l\xE9verser les pi\xE8ces jointes des notes",
    "attachments.desc": "Lorsqu\u2019elle est activ\xE9e, les images r\xE9f\xE9renc\xE9es dans les notes mises en miroir sont t\xE9l\xE9vers\xE9es. Pour les PDF, ajoutez ai-attachments: true au frontmatter de la note.",
    "maxAttachment.name": "Taille maximale par pi\xE8ce jointe (Mo)",
    "maxAttachment.desc": "Par d\xE9faut : 8 Mo. La limite actuelle du service est de {limit} Mo.",
    "testConnection.name": "Tester la connexion",
    "testConnection.button": "Tester",
    "fullSync.name": "Lancer une synchronisation compl\xE8te maintenant",
    "fullSync.desc": "Lorsque la synchronisation bidirectionnelle est d\xE9sactiv\xE9e, rev\xE9rifie et envoie toutes les notes. Lorsqu\u2019elle est activ\xE9e, lance un passage complet d\u2019envoi et de t\xE9l\xE9chargement. Les pi\xE8ces jointes sont incluses si elles sont activ\xE9es.",
    "fullSync.button": "Synchroniser",
    "transfer.heading": "Transf\xE9rer les param\xE8tres vers iPhone / iPad",
    "transfer.intro": "Le lien d\u2019exportation contient le point de terminaison, le jeton d\u2019\xE9criture et les param\xE8tres de cette page, le tout chiffr\xE9 avec un mot de passe de transfert distinct. Ne r\xE9utilisez pas le jeton du service comme mot de passe de transfert.",
    "transfer.create.name": "Cr\xE9er un lien de param\xE8tres chiffr\xE9",
    "transfer.create.desc": "Le lien est copi\xE9 dans le presse-papiers. Collez-le dans les param\xE8tres d\u2019AI Bridge sur iOS ou ouvrez-le directement.",
    "transfer.create.button": "Cr\xE9er et copier",
    "transfer.create.modalTitle": "Cr\xE9er un lien de param\xE8tres chiffr\xE9",
    "transfer.create.modalDesc": "Choisissez un mot de passe de transfert temporaire d\u2019au moins 8 caract\xE8res. Vous devrez le saisir \xE0 nouveau lors de l\u2019importation sur iOS.",
    "transfer.create.submit": "Chiffrer et copier",
    "transfer.import.name": "Importer depuis un lien de param\xE8tres chiffr\xE9",
    "transfer.import.desc": "Sur iOS, collez le lien obsidian:// cr\xE9\xE9 sur votre ordinateur.",
    "transfer.import.button": "Coller le lien",
    "transfer.import.modalTitle": "Collez un lien de param\xE8tres AI Bridge",
    "transfer.import.continue": "Continuer",
    "passphrase.label": "Mot de passe de transfert",
    "passphrase.repeat": "Saisissez-le \xE0 nouveau",
    "button.cancel": "Annuler",
    "button.importAnyway": "Importer quand m\xEAme",
    "notice.configFirst": "AI Bridge : renseignez d\u2019abord le point de terminaison et le jeton d\u2019\xE9criture",
    "notice.syncRunning": "AI Bridge : une synchronisation est d\xE9j\xE0 en cours",
    "notice.connectionSuccess": "AI Bridge : connexion r\xE9ussie",
    "notice.linkCopied": "AI Bridge : le lien de param\xE8tres chiffr\xE9 a \xE9t\xE9 copi\xE9",
    "notice.imported": "AI Bridge : param\xE8tres import\xE9s en toute s\xE9curit\xE9",
    "notice.pasteFirst": "Collez d\u2019abord le lien de param\xE8tres",
    "notice.passphraseShort": "Le mot de passe de transfert doit comporter au moins 8 caract\xE8res",
    "notice.passphraseMismatch": "Les mots de passe de transfert ne correspondent pas",
    "error.unconfigured": "AI Bridge n\u2019est pas configur\xE9",
    "error.configureFirst": "Veuillez d\u2019abord renseigner le point de terminaison et le jeton d\u2019\xE9criture",
    "error.invalidLinkFormat": "Le format du lien de param\xE8tres est invalide",
    "error.copyFailed": "Impossible de copier dans le presse-papiers",
    "error.notSettingsLink": "Ce lien n\u2019est pas un lien de param\xE8tres AI Bridge",
    "error.unsupportedLinkVersion": "Cette version du lien de param\xE8tres n\u2019est pas prise en charge",
    "error.incompleteLink": "Le lien de param\xE8tres est incomplet",
    "error.decryptFailed": "Le mot de passe de transfert est incorrect ou le lien de param\xE8tres est endommag\xE9",
    "error.attachmentUploadFailed": "\xC9chec du t\xE9l\xE9versement de la pi\xE8ce jointe {path} : HTTP {status}",
    "confirm.differentVault.title": "Les noms des coffres sont diff\xE9rents",
    "confirm.differentVault.message": "Le lien provient de \xAB {sourceVault} \xBB, tandis que le coffre actuel est \xAB {currentVault} \xBB. Importer quand m\xEAme ?",
    "modal.import.title": "Importer les param\xE8tres d\u2019AI Bridge",
    "modal.import.description": "Saisissez le mot de passe de transfert utilis\xE9 lors de la cr\xE9ation du lien. Ce n\u2019est pas le jeton d\u2019\xE9criture du service.",
    "modal.import.submit": "D\xE9chiffrer et importer",
    "generic.errorPrefix": "AI Bridge : {message}",
    "sync.summary": "AI Bridge : {notes} notes synchronis\xE9es{details}{failures}",
    "sync.attachmentsDetail": ", {count} pi\xE8ces jointes",
    "sync.skippedDetail": ", {count} ignor\xE9es car trop volumineuses",
    "sync.failedDetail": ", {count} \xE9checs",
    "twoWay.summary": "Synchronisation bidirectionnelle AI Bridge : {uploaded} envoy\xE9s, {downloaded} t\xE9l\xE9charg\xE9s, {conflicts} conflits. Les anciennes versions sont dans AI Bridge Conflicts."
  },
  es: {
    "command.fullSync": "Ejecutar ahora una sincronizaci\xF3n completa de AI Mirror",
    "settings.intro": "Solo se reflejan los archivos Markdown. Si especificas carpetas, solo se sincronizan esas carpetas; deja la lista vac\xEDa para sincronizar toda la b\xF3veda. Los archivos adjuntos deben estar referenciados por esas notas y la sincronizaci\xF3n de adjuntos debe activarse por separado. La carpeta .obsidian nunca se sube.",
    "workerUrl.name": "URL del Worker",
    "workerUrl.desc": "Introduce el endpoint HTTPS de tu servicio compatible con AI Bridge.",
    "workerUrl.placeholder": "Introduce el endpoint HTTPS",
    "writeToken.name": "Token de escritura",
    "writeToken.desc": "Solo se guarda en la configuraci\xF3n local de este complemento. Nunca se registra ni se incluye en texto plano en un enlace de exportaci\xF3n.",
    "allowedFolders.name": "Carpetas que se reflejar\xE1n",
    "allowedFolders.desc": "Una ruta relativa a la b\xF3veda por l\xEDnea. Las subcarpetas se incluyen autom\xE1ticamente. D\xE9jalo vac\xEDo para sincronizar toda la b\xF3veda; .obsidian siempre queda excluido.",
    "twoWay.name": "Sincronizaci\xF3n bidireccional",
    "twoWay.desc": "Desactivada de forma predeterminada. Al activarla, el inicio, los cambios, la programaci\xF3n y Sincronizar ahora suben y descargan archivos. Si ambos lados cambiaron, gana la modificaci\xF3n m\xE1s reciente y la versi\xF3n anterior se guarda en AI Bridge Conflicts.",
    "deviceName.name": "Nombre de este dispositivo",
    "deviceName.desc": "Aparece en los nombres de las copias en conflicto para identificar al instante su dispositivo de origen.",
    "twoWay.status.name": "Estado de sincronizaci\xF3n bidireccional",
    "twoWay.status.desc": "\xDAltima ejecuci\xF3n correcta: {time}. Conflictos en esa ejecuci\xF3n: {conflicts}.",
    "twoWay.status.lastConflict": "\xDAltima copia en conflicto: {path}",
    "twoWay.never": "Nunca",
    "syncOnChange.name": "Sincronizar al cambiar archivos",
    "syncOnChange.desc": "Sube una nota despu\xE9s de crearla o modificarla.",
    "scheduledSync.name": "Sincronizaci\xF3n incremental programada independiente",
    "scheduledSync.desc": "Se ejecuta solo mientras Obsidian est\xE1 abierto y con el intervalo que elijas. Solo se sube el contenido cambiado desde la \xFAltima sincronizaci\xF3n correcta.",
    "scheduledInterval.name": "Intervalo de sincronizaci\xF3n programada (minutos)",
    "scheduledInterval.desc": "De 1 a 1440 minutos. Valor predeterminado: 15 minutos.",
    "attachments.name": "Subir archivos adjuntos de las notas",
    "attachments.desc": "Al activarlo, se suben las im\xE1genes referenciadas en las notas reflejadas. Para los PDF, a\xF1ade ai-attachments: true al frontmatter de la nota.",
    "maxAttachment.name": "Tama\xF1o m\xE1ximo de cada archivo adjunto (MB)",
    "maxAttachment.desc": "Valor predeterminado: 8 MB. El l\xEDmite actual del servicio es de {limit} MB.",
    "testConnection.name": "Probar conexi\xF3n",
    "testConnection.button": "Probar",
    "fullSync.name": "Ejecutar una sincronizaci\xF3n completa ahora",
    "fullSync.desc": "Con la sincronizaci\xF3n bidireccional desactivada, vuelve a comprobar y sube todas las notas. Con ella activada, ejecuta una pasada completa de subida y descarga. Incluye adjuntos cuando est\xE1n activados.",
    "fullSync.button": "Sincronizar ahora",
    "transfer.heading": "Transferir la configuraci\xF3n a iPhone / iPad",
    "transfer.intro": "El enlace de exportaci\xF3n contiene el endpoint, el token de escritura y la configuraci\xF3n de esta p\xE1gina, todo cifrado con una contrase\xF1a de transferencia independiente. No reutilices el token del servicio como contrase\xF1a de transferencia.",
    "transfer.create.name": "Crear un enlace de configuraci\xF3n cifrado",
    "transfer.create.desc": "El enlace se copia al portapapeles. P\xE9galo en la configuraci\xF3n de AI Bridge en iOS o \xE1brelo directamente.",
    "transfer.create.button": "Crear y copiar",
    "transfer.create.modalTitle": "Crear un enlace de configuraci\xF3n cifrado",
    "transfer.create.modalDesc": "Elige una contrase\xF1a de transferencia temporal de al menos 8 caracteres. Tendr\xE1s que introducirla de nuevo al importar en iOS.",
    "transfer.create.submit": "Cifrar y copiar",
    "transfer.import.name": "Importar desde un enlace de configuraci\xF3n cifrado",
    "transfer.import.desc": "En iOS, pega el enlace obsidian:// creado en tu ordenador.",
    "transfer.import.button": "Pegar enlace",
    "transfer.import.modalTitle": "Pega un enlace de configuraci\xF3n de AI Bridge",
    "transfer.import.continue": "Continuar",
    "passphrase.label": "Contrase\xF1a de transferencia",
    "passphrase.repeat": "Vuelve a introducirla",
    "button.cancel": "Cancelar",
    "button.importAnyway": "Importar de todos modos",
    "notice.configFirst": "AI Bridge: primero introduce el endpoint y el token de escritura",
    "notice.syncRunning": "AI Bridge: ya hay una sincronizaci\xF3n en curso",
    "notice.connectionSuccess": "AI Bridge: conexi\xF3n correcta",
    "notice.linkCopied": "AI Bridge: enlace de configuraci\xF3n cifrado copiado",
    "notice.imported": "AI Bridge: configuraci\xF3n importada de forma segura",
    "notice.pasteFirst": "Primero pega el enlace de configuraci\xF3n",
    "notice.passphraseShort": "La contrase\xF1a de transferencia debe tener al menos 8 caracteres",
    "notice.passphraseMismatch": "Las contrase\xF1as de transferencia no coinciden",
    "error.unconfigured": "AI Bridge no est\xE1 configurado",
    "error.configureFirst": "Completa primero el endpoint y el token de escritura",
    "error.invalidLinkFormat": "El formato del enlace de configuraci\xF3n no es v\xE1lido",
    "error.copyFailed": "No se pudo copiar al portapapeles",
    "error.notSettingsLink": "Este no es un enlace de configuraci\xF3n de AI Bridge",
    "error.unsupportedLinkVersion": "Esta versi\xF3n del enlace de configuraci\xF3n no es compatible",
    "error.incompleteLink": "El enlace de configuraci\xF3n est\xE1 incompleto",
    "error.decryptFailed": "La contrase\xF1a de transferencia es incorrecta o el enlace de configuraci\xF3n est\xE1 da\xF1ado",
    "error.attachmentUploadFailed": "No se pudo subir el archivo adjunto {path}: HTTP {status}",
    "confirm.differentVault.title": "Los nombres de las b\xF3vedas son diferentes",
    "confirm.differentVault.message": "El enlace procede de \xAB{sourceVault}\xBB, mientras que la b\xF3veda actual es \xAB{currentVault}\xBB. \xBFImportar de todos modos?",
    "modal.import.title": "Importar la configuraci\xF3n de AI Bridge",
    "modal.import.description": "Introduce la contrase\xF1a de transferencia usada al crear el enlace. No es el token de escritura del servicio.",
    "modal.import.submit": "Descifrar e importar",
    "generic.errorPrefix": "AI Bridge: {message}",
    "sync.summary": "AI Bridge: {notes} notas sincronizadas{details}{failures}",
    "sync.attachmentsDetail": ", {count} archivos adjuntos",
    "sync.skippedDetail": ", {count} omitidos por superar el l\xEDmite",
    "sync.failedDetail": ", {count} errores",
    "twoWay.summary": "Sincronizaci\xF3n bidireccional de AI Bridge: {uploaded} subidos, {downloaded} descargados y {conflicts} conflictos. Las versiones anteriores est\xE1n en AI Bridge Conflicts."
  },
  ja: {
    "command.fullSync": "AI Mirror \u306E\u5B8C\u5168\u540C\u671F\u3092\u4ECA\u3059\u3050\u5B9F\u884C",
    "settings.intro": "Markdown \u30D5\u30A1\u30A4\u30EB\u306E\u307F\u3092\u30DF\u30E9\u30FC\u30EA\u30F3\u30B0\u3057\u307E\u3059\u3002\u30D5\u30A9\u30EB\u30C0\u30FC\u3092\u6307\u5B9A\u3059\u308B\u3068\u305D\u306E\u30D5\u30A9\u30EB\u30C0\u30FC\u3060\u3051\u304C\u540C\u671F\u3055\u308C\u3001\u7A7A\u6B04\u306B\u3059\u308B\u3068\u4FDD\u7BA1\u5EAB\u5168\u4F53\u304C\u540C\u671F\u3055\u308C\u307E\u3059\u3002\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB\u306F\u30CE\u30FC\u30C8\u304B\u3089\u5B9F\u969B\u306B\u53C2\u7167\u3055\u308C\u3066\u3044\u308B\u5FC5\u8981\u304C\u3042\u308A\u3001\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB\u306E\u540C\u671F\u306F\u5225\u9014\u6709\u52B9\u306B\u3057\u3066\u304F\u3060\u3055\u3044\u3002.obsidian \u30D5\u30A9\u30EB\u30C0\u30FC\u306F\u5E38\u306B\u30A2\u30C3\u30D7\u30ED\u30FC\u30C9\u3055\u308C\u307E\u305B\u3093\u3002",
    "workerUrl.name": "Worker URL",
    "workerUrl.desc": "AI Bridge \u5BFE\u5FDC\u30B5\u30FC\u30D3\u30B9\u306E HTTPS \u30A8\u30F3\u30C9\u30DD\u30A4\u30F3\u30C8\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
    "workerUrl.placeholder": "HTTPS \u30A8\u30F3\u30C9\u30DD\u30A4\u30F3\u30C8\u3092\u5165\u529B",
    "writeToken.name": "\u66F8\u304D\u8FBC\u307F\u30C8\u30FC\u30AF\u30F3",
    "writeToken.desc": "\u3053\u306E\u30D7\u30E9\u30B0\u30A4\u30F3\u306E\u30ED\u30FC\u30AB\u30EB\u8A2D\u5B9A\u306B\u306E\u307F\u4FDD\u5B58\u3055\u308C\u307E\u3059\u3002\u30ED\u30B0\u306B\u8A18\u9332\u3055\u308C\u305A\u3001\u30A8\u30AF\u30B9\u30DD\u30FC\u30C8\u30EA\u30F3\u30AF\u306B\u3082\u5E73\u6587\u3067\u542B\u307E\u308C\u307E\u305B\u3093\u3002",
    "allowedFolders.name": "\u30DF\u30E9\u30FC\u30EA\u30F3\u30B0\u3059\u308B\u30D5\u30A9\u30EB\u30C0\u30FC",
    "allowedFolders.desc": "\u4FDD\u7BA1\u5EAB\u304B\u3089\u306E\u76F8\u5BFE\u30D1\u30B9\u3092 1 \u884C\u306B 1 \u3064\u5165\u529B\u3057\u307E\u3059\u3002\u30B5\u30D6\u30D5\u30A9\u30EB\u30C0\u30FC\u306F\u81EA\u52D5\u7684\u306B\u542B\u307E\u308C\u307E\u3059\u3002\u7A7A\u6B04\u306E\u5834\u5408\u306F\u4FDD\u7BA1\u5EAB\u5168\u4F53\u3092\u540C\u671F\u3057\u307E\u3059\u3002.obsidian \u306F\u5E38\u306B\u9664\u5916\u3055\u308C\u307E\u3059\u3002",
    "twoWay.name": "\u53CC\u65B9\u5411\u540C\u671F",
    "twoWay.desc": "\u521D\u671F\u8A2D\u5B9A\u3067\u306F\u30AA\u30D5\u3067\u3059\u3002\u6709\u52B9\u306B\u3059\u308B\u3068\u3001\u8D77\u52D5\u6642\u3001\u30D5\u30A1\u30A4\u30EB\u5909\u66F4\u6642\u3001\u5B9A\u671F\u5B9F\u884C\u6642\u3001\u4ECA\u3059\u3050\u540C\u671F\u3067\u30A2\u30C3\u30D7\u30ED\u30FC\u30C9\u3068\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u3092\u884C\u3044\u307E\u3059\u3002\u4E21\u5074\u304C\u5909\u66F4\u3055\u308C\u305F\u5834\u5408\u306F\u66F4\u65B0\u6642\u523B\u304C\u65B0\u3057\u3044\u7248\u3092\u63A1\u7528\u3057\u3001\u53E4\u3044\u7248\u3092 AI Bridge Conflicts \u306B\u4FDD\u5B58\u3057\u307E\u3059\u3002",
    "deviceName.name": "\u3053\u306E\u30C7\u30D0\u30A4\u30B9\u306E\u540D\u524D",
    "deviceName.desc": "\u7AF6\u5408\u30B3\u30D4\u30FC\u306E\u30D5\u30A1\u30A4\u30EB\u540D\u306B\u5165\u308A\u3001\u53E4\u3044\u7248\u304C\u3069\u306E\u7AEF\u672B\u304B\u3089\u6765\u305F\u304B\u3059\u3050\u5206\u304B\u308A\u307E\u3059\u3002",
    "twoWay.status.name": "\u53CC\u65B9\u5411\u540C\u671F\u306E\u72B6\u614B",
    "twoWay.status.desc": "\u524D\u56DE\u306E\u6210\u529F\uFF1A{time}\u3002\u305D\u306E\u5B9F\u884C\u3067\u306E\u7AF6\u5408\uFF1A{conflicts} \u4EF6\u3002",
    "twoWay.status.lastConflict": "\u6700\u65B0\u306E\u7AF6\u5408\u30B3\u30D4\u30FC\uFF1A{path}",
    "twoWay.never": "\u672A\u5B9F\u884C",
    "syncOnChange.name": "\u30D5\u30A1\u30A4\u30EB\u5909\u66F4\u6642\u306B\u540C\u671F",
    "syncOnChange.desc": "\u30CE\u30FC\u30C8\u3092\u4F5C\u6210\u307E\u305F\u306F\u5909\u66F4\u3057\u305F\u5F8C\u306B\u30A2\u30C3\u30D7\u30ED\u30FC\u30C9\u3057\u307E\u3059\u3002",
    "scheduledSync.name": "\u72EC\u7ACB\u3057\u305F\u5B9A\u671F\u5897\u5206\u540C\u671F",
    "scheduledSync.desc": "Obsidian \u304C\u958B\u3044\u3066\u3044\u308B\u9593\u3060\u3051\u3001\u8A2D\u5B9A\u3057\u305F\u9593\u9694\u3067\u5B9F\u884C\u3057\u307E\u3059\u3002\u524D\u56DE\u6B63\u5E38\u306B\u540C\u671F\u3055\u308C\u3066\u304B\u3089\u5909\u66F4\u3055\u308C\u305F\u5185\u5BB9\u3060\u3051\u3092\u30A2\u30C3\u30D7\u30ED\u30FC\u30C9\u3057\u307E\u3059\u3002",
    "scheduledInterval.name": "\u5B9A\u671F\u540C\u671F\u306E\u9593\u9694\uFF08\u5206\uFF09",
    "scheduledInterval.desc": "1\u301C1440 \u5206\u3002\u30C7\u30D5\u30A9\u30EB\u30C8\u306F 15 \u5206\u3067\u3059\u3002",
    "attachments.name": "\u30CE\u30FC\u30C8\u306E\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB\u3092\u30A2\u30C3\u30D7\u30ED\u30FC\u30C9",
    "attachments.desc": "\u6709\u52B9\u306B\u3059\u308B\u3068\u3001\u30DF\u30E9\u30FC\u30EA\u30F3\u30B0\u5BFE\u8C61\u30CE\u30FC\u30C8\u304B\u3089\u53C2\u7167\u3055\u308C\u3066\u3044\u308B\u753B\u50CF\u3092\u30A2\u30C3\u30D7\u30ED\u30FC\u30C9\u3057\u307E\u3059\u3002PDF \u306E\u5834\u5408\u306F\u3001\u30CE\u30FC\u30C8\u306E frontmatter \u306B ai-attachments: true \u3092\u8FFD\u52A0\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
    "maxAttachment.name": "\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB 1 \u4EF6\u3042\u305F\u308A\u306E\u6700\u5927\u30B5\u30A4\u30BA\uFF08MB\uFF09",
    "maxAttachment.desc": "\u30C7\u30D5\u30A9\u30EB\u30C8\u306F 8 MB\u3002\u73FE\u5728\u306E\u30B5\u30FC\u30D3\u30B9\u4E0A\u9650\u306F {limit} MB \u3067\u3059\u3002",
    "testConnection.name": "\u63A5\u7D9A\u3092\u30C6\u30B9\u30C8",
    "testConnection.button": "\u30C6\u30B9\u30C8",
    "fullSync.name": "\u5B8C\u5168\u540C\u671F\u3092\u4ECA\u3059\u3050\u5B9F\u884C",
    "fullSync.desc": "\u53CC\u65B9\u5411\u540C\u671F\u304C\u30AA\u30D5\u306E\u5834\u5408\u306F\u5168\u30CE\u30FC\u30C8\u3092\u518D\u78BA\u8A8D\u3057\u3066\u30A2\u30C3\u30D7\u30ED\u30FC\u30C9\u3057\u307E\u3059\u3002\u30AA\u30F3\u306E\u5834\u5408\u306F\u5B8C\u5168\u306A\u30A2\u30C3\u30D7\u30ED\u30FC\u30C9\u3068\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u3092\u5B9F\u884C\u3057\u307E\u3059\u3002\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB\u540C\u671F\u304C\u6709\u52B9\u306A\u3089\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB\u3082\u542B\u307F\u307E\u3059\u3002",
    "fullSync.button": "\u4ECA\u3059\u3050\u540C\u671F",
    "transfer.heading": "iPhone / iPad \u306B\u8A2D\u5B9A\u3092\u79FB\u884C",
    "transfer.intro": "\u30A8\u30AF\u30B9\u30DD\u30FC\u30C8\u30EA\u30F3\u30AF\u306B\u306F\u30A8\u30F3\u30C9\u30DD\u30A4\u30F3\u30C8\u3001\u66F8\u304D\u8FBC\u307F\u30C8\u30FC\u30AF\u30F3\u3001\u3053\u306E\u30DA\u30FC\u30B8\u306E\u8A2D\u5B9A\u304C\u542B\u307E\u308C\u307E\u3059\u304C\u3001\u3059\u3079\u3066\u5225\u9014\u8A2D\u5B9A\u3059\u308B\u8EE2\u9001\u30D1\u30B9\u30EF\u30FC\u30C9\u3067\u6697\u53F7\u5316\u3055\u308C\u307E\u3059\u3002\u30B5\u30FC\u30D3\u30B9\u306E\u30C8\u30FC\u30AF\u30F3\u3092\u8EE2\u9001\u30D1\u30B9\u30EF\u30FC\u30C9\u3068\u3057\u3066\u4F7F\u3044\u56DE\u3055\u306A\u3044\u3067\u304F\u3060\u3055\u3044\u3002",
    "transfer.create.name": "\u6697\u53F7\u5316\u3055\u308C\u305F\u8A2D\u5B9A\u30EA\u30F3\u30AF\u3092\u4F5C\u6210",
    "transfer.create.desc": "\u30EA\u30F3\u30AF\u306F\u30AF\u30EA\u30C3\u30D7\u30DC\u30FC\u30C9\u306B\u30B3\u30D4\u30FC\u3055\u308C\u307E\u3059\u3002iOS \u306E AI Bridge \u8A2D\u5B9A\u306B\u8CBC\u308A\u4ED8\u3051\u308B\u304B\u3001\u30EA\u30F3\u30AF\u3092\u76F4\u63A5\u958B\u3044\u3066\u304F\u3060\u3055\u3044\u3002",
    "transfer.create.button": "\u4F5C\u6210\u3057\u3066\u30B3\u30D4\u30FC",
    "transfer.create.modalTitle": "\u6697\u53F7\u5316\u3055\u308C\u305F\u8A2D\u5B9A\u30EA\u30F3\u30AF\u3092\u4F5C\u6210",
    "transfer.create.modalDesc": "8 \u6587\u5B57\u4EE5\u4E0A\u306E\u4E00\u6642\u8EE2\u9001\u30D1\u30B9\u30EF\u30FC\u30C9\u3092\u8A2D\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044\u3002iOS \u3067\u30A4\u30F3\u30DD\u30FC\u30C8\u3059\u308B\u3068\u304D\u306B\u3082\u3046\u4E00\u5EA6\u5165\u529B\u3057\u307E\u3059\u3002",
    "transfer.create.submit": "\u6697\u53F7\u5316\u3057\u3066\u30B3\u30D4\u30FC",
    "transfer.import.name": "\u6697\u53F7\u5316\u3055\u308C\u305F\u8A2D\u5B9A\u30EA\u30F3\u30AF\u304B\u3089\u30A4\u30F3\u30DD\u30FC\u30C8",
    "transfer.import.desc": "iOS \u3067\u306F\u3001\u30B3\u30F3\u30D4\u30E5\u30FC\u30BF\u30FC\u3067\u4F5C\u6210\u3057\u305F obsidian:// \u30EA\u30F3\u30AF\u3092\u8CBC\u308A\u4ED8\u3051\u3066\u304F\u3060\u3055\u3044\u3002",
    "transfer.import.button": "\u30EA\u30F3\u30AF\u3092\u8CBC\u308A\u4ED8\u3051",
    "transfer.import.modalTitle": "AI Bridge \u8A2D\u5B9A\u30EA\u30F3\u30AF\u3092\u8CBC\u308A\u4ED8\u3051",
    "transfer.import.continue": "\u7D9A\u884C",
    "passphrase.label": "\u8EE2\u9001\u30D1\u30B9\u30EF\u30FC\u30C9",
    "passphrase.repeat": "\u3082\u3046\u4E00\u5EA6\u5165\u529B",
    "button.cancel": "\u30AD\u30E3\u30F3\u30BB\u30EB",
    "button.importAnyway": "\u305D\u308C\u3067\u3082\u30A4\u30F3\u30DD\u30FC\u30C8",
    "notice.configFirst": "AI Bridge: \u5148\u306B\u30A8\u30F3\u30C9\u30DD\u30A4\u30F3\u30C8\u3068\u66F8\u304D\u8FBC\u307F\u30C8\u30FC\u30AF\u30F3\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044",
    "notice.syncRunning": "AI Bridge: \u540C\u671F\u306F\u3059\u3067\u306B\u5B9F\u884C\u4E2D\u3067\u3059",
    "notice.connectionSuccess": "AI Bridge: \u63A5\u7D9A\u306B\u6210\u529F\u3057\u307E\u3057\u305F",
    "notice.linkCopied": "AI Bridge: \u6697\u53F7\u5316\u3055\u308C\u305F\u8A2D\u5B9A\u30EA\u30F3\u30AF\u3092\u30B3\u30D4\u30FC\u3057\u307E\u3057\u305F",
    "notice.imported": "AI Bridge: \u8A2D\u5B9A\u3092\u5B89\u5168\u306B\u30A4\u30F3\u30DD\u30FC\u30C8\u3057\u307E\u3057\u305F",
    "notice.pasteFirst": "\u5148\u306B\u8A2D\u5B9A\u30EA\u30F3\u30AF\u3092\u8CBC\u308A\u4ED8\u3051\u3066\u304F\u3060\u3055\u3044",
    "notice.passphraseShort": "\u8EE2\u9001\u30D1\u30B9\u30EF\u30FC\u30C9\u306F 8 \u6587\u5B57\u4EE5\u4E0A\u3067\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044",
    "notice.passphraseMismatch": "\u8EE2\u9001\u30D1\u30B9\u30EF\u30FC\u30C9\u304C\u4E00\u81F4\u3057\u307E\u305B\u3093",
    "error.unconfigured": "AI Bridge \u306F\u8A2D\u5B9A\u3055\u308C\u3066\u3044\u307E\u305B\u3093",
    "error.configureFirst": "\u5148\u306B\u30A8\u30F3\u30C9\u30DD\u30A4\u30F3\u30C8\u3068\u66F8\u304D\u8FBC\u307F\u30C8\u30FC\u30AF\u30F3\u3092\u8A2D\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044",
    "error.invalidLinkFormat": "\u8A2D\u5B9A\u30EA\u30F3\u30AF\u306E\u5F62\u5F0F\u304C\u6B63\u3057\u304F\u3042\u308A\u307E\u305B\u3093",
    "error.copyFailed": "\u30AF\u30EA\u30C3\u30D7\u30DC\u30FC\u30C9\u306B\u30B3\u30D4\u30FC\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F",
    "error.notSettingsLink": "\u3053\u308C\u306F AI Bridge \u306E\u8A2D\u5B9A\u30EA\u30F3\u30AF\u3067\u306F\u3042\u308A\u307E\u305B\u3093",
    "error.unsupportedLinkVersion": "\u3053\u306E\u8A2D\u5B9A\u30EA\u30F3\u30AF\u306E\u30D0\u30FC\u30B8\u30E7\u30F3\u306B\u306F\u5BFE\u5FDC\u3057\u3066\u3044\u307E\u305B\u3093",
    "error.incompleteLink": "\u8A2D\u5B9A\u30EA\u30F3\u30AF\u304C\u4E0D\u5B8C\u5168\u3067\u3059",
    "error.decryptFailed": "\u8EE2\u9001\u30D1\u30B9\u30EF\u30FC\u30C9\u304C\u6B63\u3057\u304F\u306A\u3044\u304B\u3001\u8A2D\u5B9A\u30EA\u30F3\u30AF\u304C\u7834\u640D\u3057\u3066\u3044\u307E\u3059",
    "error.attachmentUploadFailed": "\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB {path} \u306E\u30A2\u30C3\u30D7\u30ED\u30FC\u30C9\u306B\u5931\u6557\u3057\u307E\u3057\u305F\uFF08HTTP {status}\uFF09",
    "confirm.differentVault.title": "\u4FDD\u7BA1\u5EAB\u540D\u304C\u7570\u306A\u308A\u307E\u3059",
    "confirm.differentVault.message": "\u3053\u306E\u30EA\u30F3\u30AF\u306E\u4F5C\u6210\u5143\u306F\u300C{sourceVault}\u300D\u3067\u3059\u304C\u3001\u73FE\u5728\u306E\u4FDD\u7BA1\u5EAB\u306F\u300C{currentVault}\u300D\u3067\u3059\u3002\u305D\u308C\u3067\u3082\u30A4\u30F3\u30DD\u30FC\u30C8\u3057\u307E\u3059\u304B\uFF1F",
    "modal.import.title": "AI Bridge \u8A2D\u5B9A\u3092\u30A4\u30F3\u30DD\u30FC\u30C8",
    "modal.import.description": "\u30EA\u30F3\u30AF\u4F5C\u6210\u6642\u306B\u8A2D\u5B9A\u3057\u305F\u8EE2\u9001\u30D1\u30B9\u30EF\u30FC\u30C9\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002\u30B5\u30FC\u30D3\u30B9\u306E\u66F8\u304D\u8FBC\u307F\u30C8\u30FC\u30AF\u30F3\u3067\u306F\u3042\u308A\u307E\u305B\u3093\u3002",
    "modal.import.submit": "\u5FA9\u53F7\u3057\u3066\u30A4\u30F3\u30DD\u30FC\u30C8",
    "generic.errorPrefix": "AI Bridge: {message}",
    "sync.summary": "AI Bridge: {notes} \u4EF6\u306E\u30CE\u30FC\u30C8\u3092\u540C\u671F\u3057\u307E\u3057\u305F{details}{failures}",
    "sync.attachmentsDetail": "\u3001\u6DFB\u4ED8\u30D5\u30A1\u30A4\u30EB {count} \u4EF6",
    "sync.skippedDetail": "\u3001\u4E0A\u9650\u8D85\u904E\u306E\u305F\u3081 {count} \u4EF6\u3092\u30B9\u30AD\u30C3\u30D7",
    "sync.failedDetail": "\u3001{count} \u4EF6\u304C\u5931\u6557",
    "twoWay.summary": "AI Bridge \u53CC\u65B9\u5411\u540C\u671F\uFF1A\u30A2\u30C3\u30D7\u30ED\u30FC\u30C9 {uploaded} \u4EF6\u3001\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9 {downloaded} \u4EF6\u3001\u7AF6\u5408 {conflicts} \u4EF6\u3002\u53E4\u3044\u7248\u306F AI Bridge Conflicts \u306B\u4FDD\u5B58\u3055\u308C\u3066\u3044\u307E\u3059\u3002"
  }
};
function resolveLocale(language) {
  const value = String(language || "").toLowerCase();
  if (value.startsWith("zh")) return "zh";
  if (value.startsWith("fr")) return "fr";
  if (value.startsWith("es")) return "es";
  if (value.startsWith("ja")) return "ja";
  return "en";
}
function detectLocale(getLanguage2) {
  try {
    return resolveLocale(typeof getLanguage2 === "function" ? getLanguage2() : "en");
  } catch (e) {
    return "en";
  }
}
function format(template, variables = {}) {
  return String(template).replace(/\{([a-zA-Z]+)\}/g, (match, key) => Object.prototype.hasOwnProperty.call(variables, key) ? String(variables[key]) : match);
}
function createTranslator(locale = "en") {
  const selected = STRINGS[resolveLocale(locale)] || STRINGS.en;
  return (key, variables) => {
    var _a, _b;
    return format((_b = (_a = selected[key]) != null ? _a : STRINGS.en[key]) != null ? _b : key, variables);
  };
}

// src/rules.js
function normalizePrefix(value) {
  return String(value || "").trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}
function isPathInside(path, directory) {
  const normalized = String(path || "").replace(/\\/g, "/").toLowerCase();
  const normalizedDirectory = normalizePrefix(directory).toLowerCase();
  return Boolean(normalizedDirectory) && (normalized === normalizedDirectory || normalized.startsWith(`${normalizedDirectory}/`));
}
function isConfigPath(path, configDir = ".obsidian") {
  return isPathInside(path, ".obsidian") || isPathInside(path, configDir);
}
function isConflictPath(path) {
  return isPathInside(path, "AI Bridge Conflicts");
}
function shouldMirrorPath(path, includePrefixes = [], configDir = ".obsidian") {
  const normalized = String(path || "").replace(/\\/g, "/");
  if (!normalized.toLowerCase().endsWith(".md") || isConfigPath(normalized, configDir) || isConflictPath(normalized)) return false;
  const prefixes = Array.isArray(includePrefixes) ? includePrefixes.map(normalizePrefix).filter(Boolean) : [];
  if (prefixes.length === 0) return true;
  return prefixes.some((prefix) => normalized === `${prefix}.md` || normalized.startsWith(`${prefix}/`));
}

// src/sync.js
var CONFLICT_ROOT = "AI Bridge Conflicts";
function versionChanged(remote, tombstone, base = {}) {
  const current = tombstone && (!remote || tombstone.version >= remote.version) ? tombstone : remote;
  if (!current) return Boolean(base.remoteVersion || base.remoteHash);
  return Number(current.version || 0) !== Number(base.remoteVersion || 0) || String(current.hash || "") !== String(base.remoteHash || "") || Boolean(tombstone && current === tombstone) !== Boolean(base.remoteDeleted);
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
      const localWins2 = Number(local.mtime || 0) >= Number(cloud.mtime || 0);
      return {
        action: localWins2 ? "upload" : "download",
        conflict: true,
        loser: localWins2 ? "remote" : "local",
        cloud
      };
    }
    if (localExists && (cloud == null ? void 0 : cloud.deleted)) {
      const localWins2 = Number(local.mtime || 0) >= Number(cloud.mtime || 0);
      return {
        action: localWins2 ? "upload" : "deleteLocal",
        conflict: !localWins2,
        loser: localWins2 ? null : "local",
        cloud
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
  const localChanged = localExists ? String(local.hash || "") !== String(base.localHash || "") : localDeleted;
  const cloudChanged = versionChanged(remote, tombstone, base);
  if (!localChanged && !cloudChanged) return { action: "record", conflict: false, cloud };
  if (localChanged && !cloudChanged) {
    return { action: localExists ? "upload" : "deleteRemote", conflict: false, cloud };
  }
  if (!localChanged && cloudChanged) {
    return { action: remoteExists ? "download" : "deleteLocal", conflict: false, cloud };
  }
  const localMtime = Number((local == null ? void 0 : local.mtime) || base.localDeletedAt || Date.now());
  const cloudMtime = Number((cloud == null ? void 0 : cloud.mtime) || 0);
  const localWins = localMtime >= cloudMtime;
  if (localWins) {
    return {
      action: localExists ? "upload" : "deleteRemote",
      conflict: remoteExists,
      loser: remoteExists ? "remote" : null,
      cloud
    };
  }
  return {
    action: remoteExists ? "download" : "deleteLocal",
    conflict: localExists,
    loser: localExists ? "local" : null,
    cloud
  };
}
function safeSegment(value, fallback = "device") {
  const cleaned = String(value || "").split("").map((character) => character.charCodeAt(0) < 32 ? "-" : character).join("").replace(/[<>:"/\\|?*]/g, "-").replace(/\s+/g, " ").trim();
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
    localHash: (local == null ? void 0 : local.hash) || null,
    remoteHash: (cloud == null ? void 0 : cloud.deleted) ? null : (cloud == null ? void 0 : cloud.hash) || null,
    remoteVersion: Number((cloud == null ? void 0 : cloud.version) || 0),
    remoteDeleted: Boolean(cloud == null ? void 0 : cloud.deleted),
    remoteMtime: Number((cloud == null ? void 0 : cloud.mtime) || 0)
  };
}

// src/main.js
var SERVER_MAX_ATTACHMENT_MIB = 8;
var TRANSFER_VERSION = "1";
var TRANSFER_PROTOCOL = "ai-bridge";
var AUTO_CHECK_MS = 30 * 1e3;
var ATTACHMENT_MIME = {
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf"
};
function runtimeWindow() {
  return import_obsidian.activeWindow || window;
}
function runtimeDocument() {
  return import_obsidian.activeDocument || runtimeWindow().document;
}
var DEFAULT_SETTINGS = {
  workerUrl: "",
  token: "",
  includePrefixes: [],
  debounceMs: 1200,
  syncOnChange: true,
  autoSyncEnabled: false,
  autoSyncIntervalMinutes: 15,
  syncAttachments: false,
  maxAttachmentMiB: 8,
  lastPeriodicSyncAt: 0,
  bidirectionalEnabled: false,
  deviceId: "",
  deviceName: "",
  syncState: { notes: {}, assets: {} },
  pendingDeletes: { notes: {}, assets: {} },
  lastBidirectionalSyncAt: 0,
  lastConflictCount: 0,
  lastConflictPath: "",
  lastSyncError: ""
};
function recordObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function clampNumber(value, minimum, maximum, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}
function normalizeSettings(raw = {}) {
  const merged = Object.assign({}, DEFAULT_SETTINGS, raw || {});
  const prefixes = Array.isArray(merged.includePrefixes) ? merged.includePrefixes.map(normalizePrefix).filter(Boolean) : DEFAULT_SETTINGS.includePrefixes.slice();
  return {
    workerUrl: String(merged.workerUrl || "").trim(),
    token: String(merged.token || "").trim(),
    includePrefixes: prefixes,
    debounceMs: Math.round(clampNumber(merged.debounceMs, 250, 1e4, 1200)),
    syncOnChange: merged.syncOnChange !== false,
    autoSyncEnabled: merged.autoSyncEnabled === true,
    autoSyncIntervalMinutes: Math.round(clampNumber(merged.autoSyncIntervalMinutes, 1, 1440, 15)),
    syncAttachments: merged.syncAttachments === true,
    maxAttachmentMiB: clampNumber(merged.maxAttachmentMiB, 1, SERVER_MAX_ATTACHMENT_MIB, 8),
    lastPeriodicSyncAt: Math.max(0, Number(merged.lastPeriodicSyncAt) || 0),
    bidirectionalEnabled: merged.bidirectionalEnabled === true,
    deviceId: String(merged.deviceId || "").trim(),
    deviceName: String(merged.deviceName || "").trim(),
    syncState: {
      notes: recordObject(recordObject(merged.syncState).notes),
      assets: recordObject(recordObject(merged.syncState).assets)
    },
    pendingDeletes: {
      notes: recordObject(recordObject(merged.pendingDeletes).notes),
      assets: recordObject(recordObject(merged.pendingDeletes).assets)
    },
    lastBidirectionalSyncAt: Math.max(0, Number(merged.lastBidirectionalSyncAt) || 0),
    lastConflictCount: Math.max(0, Number(merged.lastConflictCount) || 0),
    lastConflictPath: String(merged.lastConflictPath || ""),
    lastSyncError: String(merged.lastSyncError || "")
  };
}
function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return runtimeWindow().btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function base64UrlToBytes(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = runtimeWindow().atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
async function deriveTransferKey(passphrase, salt) {
  const encoder = new TextEncoder();
  const material = await runtimeWindow().crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return runtimeWindow().crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 15e4, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}
async function encryptTransferPayload(payload, passphrase) {
  const salt = runtimeWindow().crypto.getRandomValues(new Uint8Array(16));
  const iv = runtimeWindow().crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveTransferKey(passphrase, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = new Uint8Array(await runtimeWindow().crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext));
  return {
    salt: bytesToBase64Url(salt),
    iv: bytesToBase64Url(iv),
    data: bytesToBase64Url(ciphertext)
  };
}
async function decryptTransferPayload(params, passphrase) {
  const salt = base64UrlToBytes(params.salt);
  const iv = base64UrlToBytes(params.iv);
  const ciphertext = base64UrlToBytes(params.data);
  if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 17) {
    throw new Error("Invalid settings link format");
  }
  const key = await deriveTransferKey(passphrase, salt);
  const plaintext = await runtimeWindow().crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext));
}
async function copyText(text) {
  var _a;
  if ((_a = runtimeWindow().navigator.clipboard) == null ? void 0 : _a.writeText) {
    await runtimeWindow().navigator.clipboard.writeText(text);
    return;
  }
  const document = runtimeDocument();
  const area = document.createElement("textarea");
  area.value = text;
  area.addClass("ai-bridge-clipboard-helper");
  document.body.appendChild(area);
  area.select();
  const copied = document.execCommand("copy");
  area.remove();
  if (!copied) throw new Error("Unable to copy to the clipboard");
}
async function sha256Hex(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
  const digest = new Uint8Array(await runtimeWindow().crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function responseJson(response) {
  return (response == null ? void 0 : response.json) && typeof response.json === "object" ? response.json : {};
}
var AIBridgePlugin = class extends import_obsidian.Plugin {
  async onload() {
    this.settings = normalizeSettings(await this.loadData());
    if (!this.settings.deviceId) this.settings.deviceId = runtimeWindow().crypto.randomUUID();
    if (!this.settings.deviceName) this.settings.deviceName = `Device-${this.settings.deviceId.slice(0, 6)}`;
    this.locale = detectLocale(import_obsidian.getLanguage);
    this.t = createTranslator(this.locale);
    this.timers = /* @__PURE__ */ new Map();
    this.inFlightNotes = /* @__PURE__ */ new Map();
    this.fullSyncPromise = null;
    this.bidirectionalPromise = null;
    this.bidirectionalTimer = null;
    this.applyingRemote = false;
    this.lastAutoAttemptAt = 0;
    await this.persistSettings();
    this.addCommand({
      id: "sync-ai-mirror-now",
      name: this.t("command.fullSync"),
      callback: () => this.runPreferredSync(true)
    });
    this.addRibbonIcon("cloud-upload", this.t("command.fullSync"), () => {
      this.runPreferredSync(true).catch((error) => {
        console.warn("AI Bridge manual sync failed", String((error == null ? void 0 : error.message) || error));
      });
    });
    this.addSettingTab(new AIBridgeSettingTab(this.app, this));
    this.registerEvent(this.app.vault.on("create", (file) => this.handleVaultChange(file)));
    this.registerEvent(this.app.vault.on("modify", (file) => this.handleVaultChange(file)));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      if (this.applyingRemote) return;
      if (this.settings.bidirectionalEnabled) {
        this.recordPendingDelete(oldPath, file);
        this.handleVaultChange(file);
        return;
      }
      if (!this.settings.syncOnChange) return;
      if (this.shouldMirrorPath(oldPath)) this.deleteRemote(oldPath).catch(() => {
      });
      if (this.settings.syncAttachments && this.isSupportedAttachmentPath(oldPath)) {
        this.deleteRemoteAttachment(oldPath).catch(() => {
        });
      }
      this.handleVaultChange(file);
    }));
    this.registerEvent(this.app.vault.on("delete", (file) => {
      if (this.applyingRemote) return;
      if (this.settings.bidirectionalEnabled) {
        this.recordPendingDelete(file.path, file);
        this.queueBidirectionalSync();
        return;
      }
      if (!this.settings.syncOnChange) return;
      if (file instanceof import_obsidian.TFile && this.shouldMirror(file)) {
        this.deleteRemote(file.path).catch(() => {
        });
      }
      if (file instanceof import_obsidian.TFile && this.settings.syncAttachments && this.isSupportedAttachment(file)) {
        this.deleteRemoteAttachment(file.path).catch(() => {
        });
      }
    }));
    this.registerObsidianProtocolHandler(TRANSFER_PROTOCOL, (params) => {
      this.handleTransferImport(params).catch((error) => {
        console.warn("AI Bridge settings import failed", String((error == null ? void 0 : error.message) || error));
        new import_obsidian.Notice(this.t("generic.errorPrefix", { message: String((error == null ? void 0 : error.message) || error) }));
      });
    });
    this.registerInterval(window.setInterval(() => {
      this.maybeRunAutoSync().catch((error) => {
        console.warn("AI Bridge scheduled sync failed", String((error == null ? void 0 : error.message) || error));
      });
    }, AUTO_CHECK_MS));
    this.app.workspace.onLayoutReady(() => {
      if (!this.settings.bidirectionalEnabled || !this.ready()) return;
      window.setTimeout(() => this.syncBidirectional(false).catch((error) => {
        console.warn("AI Bridge startup two-way sync failed", String((error == null ? void 0 : error.message) || error));
      }), 1500);
    });
  }
  onunload() {
    for (const timer of this.timers.values()) window.clearTimeout(timer);
    this.timers.clear();
    if (this.bidirectionalTimer) window.clearTimeout(this.bidirectionalTimer);
  }
  async persistSettings() {
    this.settings = normalizeSettings(this.settings);
    await this.saveData(this.settings);
  }
  normalizeBase() {
    return (this.settings.workerUrl || "").trim().replace(/\/+$/, "");
  }
  ready() {
    return Boolean(this.normalizeBase() && (this.settings.token || "").trim());
  }
  shouldMirrorPath(path) {
    return shouldMirrorPath(path, this.settings.includePrefixes, this.app.vault.configDir);
  }
  shouldMirror(file) {
    return file instanceof import_obsidian.TFile && file.extension.toLowerCase() === "md" && this.shouldMirrorPath(file.path);
  }
  isSupportedAttachment(file) {
    return file instanceof import_obsidian.TFile && this.isSupportedAttachmentPath(file.path);
  }
  isSupportedAttachmentPath(path) {
    const normalized = String(path || "").replace(/\\/g, "/");
    const extension = normalized.includes(".") ? normalized.split(".").pop().toLowerCase() : "";
    return Boolean(ATTACHMENT_MIME[extension]) && !isConfigPath(normalized, this.app.vault.configDir) && !isConflictPath(normalized);
  }
  handleVaultChange(file) {
    if (this.applyingRemote) return;
    if (!this.ready() || !(file instanceof import_obsidian.TFile)) return;
    if (this.settings.bidirectionalEnabled) {
      if (this.shouldMirror(file) || this.settings.syncAttachments && this.isSupportedAttachment(file)) {
        this.queueBidirectionalSync();
      }
      return;
    }
    if (!this.settings.syncOnChange) return;
    if (this.shouldMirror(file)) {
      this.queueNote(file);
      return;
    }
    if (this.settings.syncAttachments && this.isSupportedAttachment(file)) {
      this.queueNotesReferencingAttachment(file);
    }
  }
  recordPendingDelete(path, file) {
    const normalized = String(path || "").replace(/\\/g, "/");
    if (this.shouldMirrorPath(normalized)) {
      this.settings.pendingDeletes.notes[normalized] = Date.now();
    } else if (file instanceof import_obsidian.TFile && this.settings.syncAttachments && this.isSupportedAttachmentPath(normalized)) {
      this.settings.pendingDeletes.assets[normalized] = Date.now();
    }
    this.persistSettings().catch(() => {
    });
  }
  queueBidirectionalSync() {
    if (!this.settings.bidirectionalEnabled || !this.ready()) return;
    if (this.bidirectionalTimer) window.clearTimeout(this.bidirectionalTimer);
    this.bidirectionalTimer = window.setTimeout(() => {
      this.bidirectionalTimer = null;
      this.syncBidirectional(false).catch((error) => {
        console.warn("AI Bridge two-way sync failed", String((error == null ? void 0 : error.message) || error));
      });
    }, this.settings.debounceMs);
  }
  runPreferredSync(showNotice = false) {
    return this.settings.bidirectionalEnabled ? this.syncBidirectional(showNotice) : this.syncAll(showNotice, { changedOnly: false });
  }
  queueNote(file) {
    if (!this.shouldMirror(file) || !this.ready()) return;
    const path = file.path;
    const old = this.timers.get(path);
    if (old) window.clearTimeout(old);
    this.timers.set(path, window.setTimeout(() => {
      this.timers.delete(path);
      this.pushFile(file).catch((error) => {
        console.warn("AI Bridge sync failed for", path, String((error == null ? void 0 : error.message) || error));
      });
    }, this.settings.debounceMs));
  }
  queueNotesReferencingAttachment(attachment) {
    const key = `attachment:${attachment.path}`;
    const old = this.timers.get(key);
    if (old) window.clearTimeout(old);
    this.timers.set(key, window.setTimeout(() => {
      this.timers.delete(key);
      for (const note of this.app.vault.getMarkdownFiles()) {
        if (!this.shouldMirror(note)) continue;
        if (this.getReferencedAttachments(note).some((file) => file.path === attachment.path)) {
          this.queueNote(note);
        }
      }
    }, this.settings.debounceMs));
  }
  async api(path, options = {}) {
    if (!this.ready()) throw new Error(this.t("error.unconfigured"));
    const headers = Object.assign({}, options.headers || {}, {
      Authorization: `Bearer ${this.settings.token}`
    });
    if (typeof options.body === "string" && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    return (0, import_obsidian.requestUrl)({
      url: `${this.normalizeBase()}${path}`,
      method: options.method || "GET",
      headers,
      body: options.body,
      throw: false
    });
  }
  frontmatterAllowsPdf(note) {
    var _a, _b;
    const value = (_b = (_a = this.app.metadataCache.getFileCache(note)) == null ? void 0 : _a.frontmatter) == null ? void 0 : _b["ai-attachments"];
    return value === true || value === 1 || ["true", "yes", "on", "1"].includes(String(value || "").toLowerCase());
  }
  getReferencedAttachments(note) {
    const cache = this.app.metadataCache.getFileCache(note) || {};
    const references = [...cache.embeds || [], ...cache.links || []];
    const allowPdf = this.frontmatterAllowsPdf(note);
    const found = /* @__PURE__ */ new Map();
    for (const reference of references) {
      const target = this.app.metadataCache.getFirstLinkpathDest(reference.link, note.path);
      if (!this.isSupportedAttachment(target)) continue;
      if (target.extension.toLowerCase() === "pdf" && !allowPdf) continue;
      found.set(target.path, target);
    }
    return Array.from(found.values());
  }
  async uploadAttachment(note, attachment, baseVersion = 0) {
    var _a, _b;
    const maxBytes = this.settings.maxAttachmentMiB * 1024 * 1024;
    if ((((_a = attachment.stat) == null ? void 0 : _a.size) || 0) > maxBytes) return { uploaded: 0, skipped: 1 };
    const mime = ATTACHMENT_MIME[attachment.extension.toLowerCase()];
    const binary = await this.app.vault.readBinary(attachment);
    const query = `?path=${encodeURIComponent(attachment.path)}&note=${encodeURIComponent(note.path)}`;
    const response = await this.api(`/asset${query}`, {
      method: "PUT",
      headers: {
        "Content-Type": mime,
        "X-Mirror-Mtime": String(((_b = attachment.stat) == null ? void 0 : _b.mtime) || Date.now()),
        "X-Mirror-Device": this.settings.deviceId,
        "X-Mirror-Base-Version": String(baseVersion || 0)
      },
      body: binary
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(this.t("error.attachmentUploadFailed", {
        path: attachment.path,
        status: response.status
      }));
    }
    return { uploaded: 1, skipped: 0, remote: responseJson(response) };
  }
  async pushFile(file, baseVersion = 0, includeAttachments = true) {
    if (!this.shouldMirror(file)) return { uploaded: 0, skipped: 0 };
    const existing = this.inFlightNotes.get(file.path);
    if (existing) return existing;
    const job = this.pushFileNow(file, baseVersion, includeAttachments).finally(() => this.inFlightNotes.delete(file.path));
    this.inFlightNotes.set(file.path, job);
    return job;
  }
  async pushFileNow(file, baseVersion = 0, includeAttachments = true) {
    var _a;
    const content = await this.app.vault.read(file);
    const response = await this.api("/note", {
      method: "PUT",
      body: JSON.stringify({
        path: file.path,
        content,
        mtime: ((_a = file.stat) == null ? void 0 : _a.mtime) || Date.now(),
        deviceId: this.settings.deviceId,
        baseVersion
      })
    });
    if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}`);
    const totals = { uploaded: 0, skipped: 0 };
    if (!this.settings.syncAttachments || !includeAttachments) return { ...totals, remote: responseJson(response) };
    for (const attachment of this.getReferencedAttachments(file)) {
      const result = await this.uploadAttachment(file, attachment);
      totals.uploaded += result.uploaded;
      totals.skipped += result.skipped;
    }
    return { ...totals, remote: responseJson(response) };
  }
  async deleteRemote(path, options = {}) {
    if (!this.ready() || !this.shouldMirrorPath(path)) return;
    const params = new URLSearchParams({
      path,
      mtime: String(options.mtime || Date.now()),
      deviceId: this.settings.deviceId,
      baseVersion: String(options.baseVersion || 0)
    });
    const response = await this.api(`/note?${params.toString()}`, { method: "DELETE" });
    if (response.status !== 404 && (response.status < 200 || response.status >= 300)) {
      throw new Error(`HTTP ${response.status}`);
    }
    return responseJson(response);
  }
  async deleteRemoteAttachment(path, options = {}) {
    if (!this.ready() || !this.isSupportedAttachmentPath(path)) return;
    const params = new URLSearchParams({
      path,
      mtime: String(options.mtime || Date.now()),
      deviceId: this.settings.deviceId,
      baseVersion: String(options.baseVersion || 0)
    });
    const response = await this.api(`/asset?${params.toString()}`, { method: "DELETE" });
    if (response.status !== 404 && (response.status < 200 || response.status >= 300)) {
      throw new Error(`HTTP ${response.status}`);
    }
    return responseJson(response);
  }
  async ensureParentFolders(path) {
    const parts = String(path || "").replace(/\\/g, "/").split("/").slice(0, -1);
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(current)) {
        try {
          await this.app.vault.createFolder(current);
        } catch (e) {
          if (!this.app.vault.getAbstractFileByPath(current)) throw new Error(`Unable to create folder: ${current}`);
        }
      }
    }
  }
  uniqueConflictPath(path) {
    if (!this.app.vault.getAbstractFileByPath(path)) return path;
    const dot = path.lastIndexOf(".");
    const stem = dot > path.lastIndexOf("/") ? path.slice(0, dot) : path;
    const extension = dot > path.lastIndexOf("/") ? path.slice(dot) : "";
    for (let index = 2; index < 1e3; index += 1) {
      const candidate = `${stem} ${index}${extension}`;
      if (!this.app.vault.getAbstractFileByPath(candidate)) return candidate;
    }
    throw new Error("Unable to allocate a conflict copy path");
  }
  async saveConflictCopy(path, value, sourceDevice, mtime, binary = false) {
    const conflictPath = this.uniqueConflictPath(makeConflictPath(path, sourceDevice, mtime));
    await this.ensureParentFolders(conflictPath);
    if (binary) await this.app.vault.createBinary(conflictPath, value);
    else await this.app.vault.create(conflictPath, value);
    this.settings.lastConflictPath = conflictPath;
    return conflictPath;
  }
  async localNoteSnapshot(file) {
    var _a;
    const content = await this.app.vault.read(file);
    return { file, content, hash: await sha256Hex(content), mtime: Number(((_a = file.stat) == null ? void 0 : _a.mtime) || 0) };
  }
  async readRemoteNote(path) {
    const response = await this.api(`/note?path=${encodeURIComponent(path)}`);
    if (response.status < 200 || response.status >= 300) throw new Error(`Unable to download ${path}: HTTP ${response.status}`);
    return responseJson(response);
  }
  async writeRemoteNote(path, content) {
    await this.ensureParentFolders(path);
    const existing = this.app.vault.getAbstractFileByPath(path);
    this.applyingRemote = true;
    try {
      if (existing instanceof import_obsidian.TFile) await this.app.vault.modify(existing, content);
      else await this.app.vault.create(path, content);
    } finally {
      this.applyingRemote = false;
    }
    const written = this.app.vault.getAbstractFileByPath(path);
    if (!(written instanceof import_obsidian.TFile)) throw new Error(`Unable to write ${path}`);
    return this.localNoteSnapshot(written);
  }
  async deleteLocalFile(file) {
    if (!(file instanceof import_obsidian.TFile)) return;
    this.applyingRemote = true;
    try {
      await this.app.vault.delete(file);
    } finally {
      this.applyingRemote = false;
    }
  }
  async fetchSyncManifest() {
    const response = await this.api("/sync/manifest");
    if (response.status < 200 || response.status >= 300) throw new Error(`Manifest HTTP ${response.status}`);
    const manifest = responseJson(response);
    if (manifest.schema !== 1 || !Array.isArray(manifest.notes)) throw new Error("Unsupported sync manifest");
    return manifest;
  }
  async syncNotes(manifest, totals) {
    var _a, _b;
    const local = /* @__PURE__ */ new Map();
    for (const file of this.app.vault.getMarkdownFiles().filter((item) => this.shouldMirror(item))) {
      local.set(file.path, await this.localNoteSnapshot(file));
    }
    const remote = new Map(manifest.notes.map((item) => [item.path, item]));
    const tombstones = new Map(manifest.deletedNotes.map((item) => [item.path, item]));
    const states = this.settings.syncState.notes;
    const allPaths = /* @__PURE__ */ new Set([...local.keys(), ...remote.keys(), ...tombstones.keys(), ...Object.keys(states)]);
    for (const path of [...allPaths].sort()) {
      if (!this.shouldMirrorPath(path)) continue;
      this.currentSyncItem = `note:${path}`;
      const localItem = local.get(path) || null;
      const remoteItem = remote.get(path) || null;
      const tombstone = tombstones.get(path) || null;
      const base = states[path] || null;
      if (!localItem && (base == null ? void 0 : base.localHash) && this.settings.pendingDeletes.notes[path]) {
        base.localDeletedAt = this.settings.pendingDeletes.notes[path];
      }
      const decision = decideSyncAction({ local: localItem, remote: remoteItem, tombstone, base });
      let remoteContent = null;
      if (decision.conflict && decision.loser === "remote" && remoteItem) {
        remoteContent = await this.readRemoteNote(path);
        await this.saveConflictCopy(path, remoteContent.content, remoteItem.deviceId, remoteItem.mtime, false);
        totals.conflicts += 1;
      } else if (decision.conflict && decision.loser === "local" && localItem) {
        await this.saveConflictCopy(path, localItem.content, this.settings.deviceName, localItem.mtime, false);
        totals.conflicts += 1;
      }
      if (decision.action === "upload") {
        const result = await this.pushFile(localItem.file, Number(((_a = decision.cloud) == null ? void 0 : _a.version) || 0), false);
        const cloud = result.remote;
        states[path] = stateFrom(localItem, cloud);
        totals.uploaded += 1;
      } else if (decision.action === "download") {
        const note = remoteContent || await this.readRemoteNote(path);
        const written = await this.writeRemoteNote(path, note.content);
        states[path] = stateFrom(written, { ...remoteItem, hash: note.hash || remoteItem.hash });
        totals.downloaded += 1;
      } else if (decision.action === "deleteRemote") {
        const deletedAt = Number(this.settings.pendingDeletes.notes[path] || Date.now());
        const result = await this.deleteRemote(path, { mtime: deletedAt, baseVersion: Number(((_b = decision.cloud) == null ? void 0 : _b.version) || 0) });
        states[path] = stateFrom(null, { ...result, deleted: true });
        totals.remoteDeleted += 1;
      } else if (decision.action === "deleteLocal") {
        if (localItem) await this.deleteLocalFile(localItem.file);
        states[path] = stateFrom(null, decision.cloud);
        totals.localDeleted += 1;
      } else {
        states[path] = stateFrom(localItem, remoteSnapshot(remoteItem, tombstone));
      }
      delete this.settings.pendingDeletes.notes[path];
    }
  }
  async localAssetSnapshot(file, sourceNote) {
    var _a;
    const binary = await this.app.vault.readBinary(file);
    return { file, sourceNote, binary, hash: await sha256Hex(binary), mtime: Number(((_a = file.stat) == null ? void 0 : _a.mtime) || 0) };
  }
  async readRemoteAsset(path) {
    const response = await this.api(`/asset?path=${encodeURIComponent(path)}`);
    if (response.status < 200 || response.status >= 300) throw new Error(`Unable to download ${path}: HTTP ${response.status}`);
    return response.arrayBuffer;
  }
  async writeRemoteAsset(path, binary) {
    await this.ensureParentFolders(path);
    const existing = this.app.vault.getAbstractFileByPath(path);
    this.applyingRemote = true;
    try {
      if (existing instanceof import_obsidian.TFile) await this.app.vault.modifyBinary(existing, binary);
      else await this.app.vault.createBinary(path, binary);
    } finally {
      this.applyingRemote = false;
    }
    const written = this.app.vault.getAbstractFileByPath(path);
    if (!(written instanceof import_obsidian.TFile)) throw new Error(`Unable to write ${path}`);
    return this.localAssetSnapshot(written, null);
  }
  async syncAssets(manifest, totals) {
    var _a, _b;
    if (!this.settings.syncAttachments) return;
    const local = /* @__PURE__ */ new Map();
    for (const note of this.app.vault.getMarkdownFiles().filter((item) => this.shouldMirror(item))) {
      for (const attachment of this.getReferencedAttachments(note)) {
        if (!local.has(attachment.path)) local.set(attachment.path, await this.localAssetSnapshot(attachment, note));
      }
    }
    const remote = new Map(manifest.assets.map((item) => [item.path, item]));
    const tombstones = new Map(manifest.deletedAssets.map((item) => [item.path, item]));
    const states = this.settings.syncState.assets;
    const allPaths = /* @__PURE__ */ new Set([...local.keys(), ...remote.keys(), ...tombstones.keys(), ...Object.keys(states)]);
    for (const path of [...allPaths].sort()) {
      if (!this.isSupportedAttachmentPath(path)) continue;
      this.currentSyncItem = `asset:${path}`;
      const localItem = local.get(path) || null;
      const remoteItem = remote.get(path) || null;
      const tombstone = tombstones.get(path) || null;
      const base = states[path] || null;
      if (!localItem && (base == null ? void 0 : base.localHash) && this.settings.pendingDeletes.assets[path]) {
        base.localDeletedAt = this.settings.pendingDeletes.assets[path];
      }
      const decision = decideSyncAction({ local: localItem, remote: remoteItem, tombstone, base });
      let remoteBinary = null;
      if (decision.conflict && decision.loser === "remote" && remoteItem) {
        remoteBinary = await this.readRemoteAsset(path);
        await this.saveConflictCopy(path, remoteBinary, remoteItem.deviceId, remoteItem.mtime, true);
        totals.conflicts += 1;
      } else if (decision.conflict && decision.loser === "local" && localItem) {
        await this.saveConflictCopy(path, localItem.binary, this.settings.deviceName, localItem.mtime, true);
        totals.conflicts += 1;
      }
      if (decision.action === "upload") {
        const result = await this.uploadAttachment(localItem.sourceNote, localItem.file, Number(((_a = decision.cloud) == null ? void 0 : _a.version) || 0));
        states[path] = stateFrom(localItem, result.remote);
        totals.attachmentsUploaded += 1;
      } else if (decision.action === "download") {
        const binary = remoteBinary || await this.readRemoteAsset(path);
        const written = await this.writeRemoteAsset(path, binary);
        states[path] = stateFrom(written, remoteItem);
        totals.attachmentsDownloaded += 1;
      } else if (decision.action === "deleteRemote") {
        const deletedAt = Number(this.settings.pendingDeletes.assets[path] || Date.now());
        const result = await this.deleteRemoteAttachment(path, { mtime: deletedAt, baseVersion: Number(((_b = decision.cloud) == null ? void 0 : _b.version) || 0) });
        states[path] = stateFrom(null, { ...result, deleted: true });
        totals.remoteDeleted += 1;
      } else if (decision.action === "deleteLocal") {
        if (localItem) await this.deleteLocalFile(localItem.file);
        states[path] = stateFrom(null, decision.cloud);
        totals.localDeleted += 1;
      } else {
        states[path] = stateFrom(localItem, remoteSnapshot(remoteItem, tombstone));
      }
      delete this.settings.pendingDeletes.assets[path];
    }
  }
  async syncBidirectional(showNotice = false) {
    if (!this.settings.bidirectionalEnabled) return this.syncAll(showNotice, { changedOnly: false });
    if (!this.ready()) {
      if (showNotice) new import_obsidian.Notice(this.t("notice.configFirst"));
      return;
    }
    if (this.bidirectionalPromise) {
      if (showNotice) new import_obsidian.Notice(this.t("notice.syncRunning"));
      return this.bidirectionalPromise;
    }
    const totals = {
      uploaded: 0,
      downloaded: 0,
      attachmentsUploaded: 0,
      attachmentsDownloaded: 0,
      remoteDeleted: 0,
      localDeleted: 0,
      conflicts: 0
    };
    this.bidirectionalPromise = (async () => {
      try {
        this.currentSyncItem = "manifest";
        const manifest = await this.fetchSyncManifest();
        await this.syncNotes(manifest, totals);
        await this.syncAssets(manifest, totals);
        this.settings.lastBidirectionalSyncAt = Date.now();
        this.settings.lastPeriodicSyncAt = this.settings.lastBidirectionalSyncAt;
        this.settings.lastConflictCount = totals.conflicts;
        this.settings.lastSyncError = "";
        this.currentSyncItem = "";
        await this.persistSettings();
        if (showNotice || totals.conflicts > 0) {
          new import_obsidian.Notice(this.t("twoWay.summary", {
            uploaded: totals.uploaded + totals.attachmentsUploaded,
            downloaded: totals.downloaded + totals.attachmentsDownloaded,
            conflicts: totals.conflicts
          }), totals.conflicts > 0 ? 12e3 : 6e3);
        }
        return totals;
      } catch (error) {
        const message = String((error == null ? void 0 : error.message) || error);
        this.settings.lastSyncError = `${this.currentSyncItem || "sync"}: ${message}`;
        await this.persistSettings();
        if (showNotice) new import_obsidian.Notice(this.t("generic.errorPrefix", { message: this.settings.lastSyncError }), 12e3);
        throw error;
      }
    })().finally(() => {
      this.bidirectionalPromise = null;
    });
    return this.bidirectionalPromise;
  }
  noteChangedSince(note, timestamp) {
    var _a;
    if (!timestamp || (((_a = note.stat) == null ? void 0 : _a.mtime) || 0) > timestamp) return true;
    if (!this.settings.syncAttachments) return false;
    return this.getReferencedAttachments(note).some((attachment) => {
      var _a2;
      return (((_a2 = attachment.stat) == null ? void 0 : _a2.mtime) || 0) > timestamp;
    });
  }
  async syncAll(showNotice = false, options = {}) {
    if (!this.ready()) {
      if (showNotice) new import_obsidian.Notice(this.t("notice.configFirst"));
      return;
    }
    if (this.fullSyncPromise) {
      if (showNotice) new import_obsidian.Notice(this.t("notice.syncRunning"));
      return this.fullSyncPromise;
    }
    const changedOnly = options.changedOnly === true;
    const startedAt = Date.now();
    const previousSyncAt = this.settings.lastPeriodicSyncAt || 0;
    this.fullSyncPromise = (async () => {
      let files = this.app.vault.getMarkdownFiles().filter((file) => this.shouldMirror(file));
      if (changedOnly) files = files.filter((file) => this.noteChangedSince(file, previousSyncAt));
      let ok = 0;
      let failed = 0;
      let attachments = 0;
      let skipped = 0;
      for (const file of files) {
        try {
          const result = await this.pushFile(file);
          ok += 1;
          attachments += result.uploaded;
          skipped += result.skipped;
        } catch (error) {
          failed += 1;
          console.warn("AI Bridge full sync failed for", file.path, String((error == null ? void 0 : error.message) || error));
        }
      }
      if (failed === 0) {
        this.settings.lastPeriodicSyncAt = startedAt;
        await this.persistSettings();
      }
      if (showNotice) {
        const details = this.settings.syncAttachments ? this.t("sync.attachmentsDetail", { count: attachments }) + (skipped ? this.t("sync.skippedDetail", { count: skipped }) : "") : "";
        const failures = failed ? this.t("sync.failedDetail", { count: failed }) : "";
        new import_obsidian.Notice(this.t("sync.summary", { notes: ok, details, failures }));
      }
      return { ok, failed, attachments, skipped };
    })().finally(() => {
      this.fullSyncPromise = null;
    });
    return this.fullSyncPromise;
  }
  async maybeRunAutoSync() {
    if (!this.settings.autoSyncEnabled || !this.ready() || this.fullSyncPromise || this.bidirectionalPromise) return;
    const intervalMs = this.settings.autoSyncIntervalMinutes * 60 * 1e3;
    const baseline = Math.max(
      this.settings.bidirectionalEnabled ? this.settings.lastBidirectionalSyncAt || 0 : this.settings.lastPeriodicSyncAt || 0,
      this.lastAutoAttemptAt || 0
    );
    if (Date.now() - baseline < intervalMs) return;
    this.lastAutoAttemptAt = Date.now();
    if (this.settings.bidirectionalEnabled) await this.syncBidirectional(false);
    else await this.syncAll(false, { changedOnly: true });
  }
  async testConnection() {
    const response = await this.api("/health");
    if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}`);
    return response.json;
  }
  exportableSettings() {
    return {
      workerUrl: this.settings.workerUrl,
      token: this.settings.token,
      includePrefixes: this.settings.includePrefixes,
      debounceMs: this.settings.debounceMs,
      syncOnChange: this.settings.syncOnChange,
      autoSyncEnabled: this.settings.autoSyncEnabled,
      autoSyncIntervalMinutes: this.settings.autoSyncIntervalMinutes,
      syncAttachments: this.settings.syncAttachments,
      maxAttachmentMiB: this.settings.maxAttachmentMiB,
      bidirectionalEnabled: this.settings.bidirectionalEnabled
    };
  }
  async createTransferLink(passphrase) {
    if (!this.ready()) throw new Error(this.t("error.configureFirst"));
    const encrypted = await encryptTransferPayload(this.exportableSettings(), passphrase);
    const params = new URLSearchParams({
      func: "settings",
      v: TRANSFER_VERSION,
      vault: this.app.vault.getName(),
      salt: encrypted.salt,
      iv: encrypted.iv,
      data: encrypted.data
    });
    return `obsidian://${TRANSFER_PROTOCOL}?${params.toString()}`;
  }
  parseTransferLink(link) {
    const parsed = new URL(String(link || "").trim());
    if (parsed.protocol !== "obsidian:" || parsed.hostname !== TRANSFER_PROTOCOL) {
      throw new Error(this.t("error.notSettingsLink"));
    }
    return Object.fromEntries(parsed.searchParams.entries());
  }
  async handleTransferImport(params) {
    var _a, _b;
    if (params.func !== "settings" || params.v !== TRANSFER_VERSION) {
      throw new Error(this.t("error.unsupportedLinkVersion"));
    }
    if (!params.salt || !params.iv || !params.data) throw new Error(this.t("error.incompleteLink"));
    const sourceVault = String(params.vault || "");
    const currentVault = this.app.vault.getName();
    if (params.setup === "1" && params.path) {
      const selectedPath = String(params.path).replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
      const currentPath = String(((_b = (_a = this.app.vault.adapter).getBasePath) == null ? void 0 : _b.call(_a)) || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
      if (!currentPath || selectedPath !== currentPath) {
        throw new Error("Open the vault selected in the Windows installer before importing settings.");
      }
    }
    if (sourceVault && sourceVault !== currentVault) {
      const confirmed = await openConfirmModal(
        this.app,
        this.t,
        this.t("confirm.differentVault.title"),
        this.t("confirm.differentVault.message", { sourceVault, currentVault })
      );
      if (!confirmed) return;
    }
    const passphrase = await openPassphraseModal(this.app, this.t, {
      title: this.t("modal.import.title"),
      description: this.t("modal.import.description"),
      confirm: false,
      submitText: this.t("modal.import.submit")
    });
    if (passphrase === null) return;
    let payload;
    try {
      payload = await decryptTransferPayload(params, passphrase);
    } catch (e) {
      throw new Error(this.t("error.decryptFailed"));
    }
    this.settings = normalizeSettings(Object.assign({}, payload, {
      deviceId: this.settings.deviceId || runtimeWindow().crypto.randomUUID(),
      deviceName: payload.installerSetup === true ? payload.deviceName : this.settings.deviceName,
      syncState: { notes: {}, assets: {} },
      pendingDeletes: { notes: {}, assets: {} },
      lastPeriodicSyncAt: 0,
      lastBidirectionalSyncAt: 0,
      lastConflictCount: 0,
      lastConflictPath: ""
    }));
    await this.persistSettings();
    new import_obsidian.Notice(this.t("notice.imported"));
    if (payload.installerSetup === true) {
      await this.testConnection();
      await this.runPreferredSync(true);
    }
  }
};
var AIBridgeSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("p", {
      text: this.plugin.t("settings.intro")
    });
    new import_obsidian.Setting(containerEl).setName(this.plugin.t("workerUrl.name")).setDesc(this.plugin.t("workerUrl.desc")).addText((text) => text.setPlaceholder(this.plugin.t("workerUrl.placeholder")).setValue(this.plugin.settings.workerUrl || "").onChange(async (value) => {
      this.plugin.settings.workerUrl = value.trim();
      await this.plugin.persistSettings();
    }));
    new import_obsidian.Setting(containerEl).setName(this.plugin.t("writeToken.name")).setDesc(this.plugin.t("writeToken.desc")).addText((text) => {
      text.inputEl.type = "password";
      text.setValue(this.plugin.settings.token || "").onChange(async (value) => {
        this.plugin.settings.token = value.trim();
        await this.plugin.persistSettings();
      });
    });
    new import_obsidian.Setting(containerEl).setName(this.plugin.t("allowedFolders.name")).setDesc(this.plugin.t("allowedFolders.desc")).addTextArea((area) => {
      area.inputEl.rows = 6;
      area.setValue(this.plugin.settings.includePrefixes.join("\n"));
      area.onChange(async (value) => {
        this.plugin.settings.includePrefixes = value.split(/\r?\n/).map(normalizePrefix).filter(Boolean);
        await this.plugin.persistSettings();
      });
    });
    new import_obsidian.Setting(containerEl).setName(this.plugin.t("twoWay.name")).setDesc(this.plugin.t("twoWay.desc")).addToggle((toggle) => toggle.setValue(this.plugin.settings.bidirectionalEnabled).onChange(async (value) => {
      this.plugin.settings.bidirectionalEnabled = value;
      this.plugin.lastAutoAttemptAt = 0;
      await this.plugin.persistSettings();
      if (value && this.plugin.ready()) this.plugin.syncBidirectional(true).catch(() => {
      });
      this.display();
    }));
    new import_obsidian.Setting(containerEl).setName(this.plugin.t("deviceName.name")).setDesc(this.plugin.t("deviceName.desc")).addText((text) => text.setValue(this.plugin.settings.deviceName).onChange(async (value) => {
      this.plugin.settings.deviceName = value.trim() || `Device-${this.plugin.settings.deviceId.slice(0, 6)}`;
      await this.plugin.persistSettings();
    }));
    const lastSync = this.plugin.settings.lastBidirectionalSyncAt ? new Date(this.plugin.settings.lastBidirectionalSyncAt).toLocaleString() : this.plugin.t("twoWay.never");
    const status = new import_obsidian.Setting(containerEl).setName(this.plugin.t("twoWay.status.name")).setDesc(this.plugin.t("twoWay.status.desc", {
      time: lastSync,
      conflicts: this.plugin.settings.lastConflictCount
    }));
    if (this.plugin.settings.lastConflictPath) {
      status.descEl.createEl("div", { text: this.plugin.t("twoWay.status.lastConflict", { path: this.plugin.settings.lastConflictPath }) });
    }
    if (this.plugin.settings.lastSyncError) {
      status.descEl.createEl("div", { text: this.plugin.t("generic.errorPrefix", { message: this.plugin.settings.lastSyncError }) });
    }
    new import_obsidian.Setting(containerEl).setName(this.plugin.t("syncOnChange.name")).setDesc(this.plugin.t("syncOnChange.desc")).addToggle((toggle) => toggle.setValue(this.plugin.settings.syncOnChange).onChange(async (value) => {
      this.plugin.settings.syncOnChange = value;
      await this.plugin.persistSettings();
    }));
    new import_obsidian.Setting(containerEl).setName(this.plugin.t("scheduledSync.name")).setDesc(this.plugin.t("scheduledSync.desc")).addToggle((toggle) => toggle.setValue(this.plugin.settings.autoSyncEnabled).onChange(async (value) => {
      this.plugin.settings.autoSyncEnabled = value;
      this.plugin.lastAutoAttemptAt = 0;
      await this.plugin.persistSettings();
    }));
    new import_obsidian.Setting(containerEl).setName(this.plugin.t("scheduledInterval.name")).setDesc(this.plugin.t("scheduledInterval.desc")).addText((text) => {
      text.inputEl.type = "number";
      text.inputEl.min = "1";
      text.inputEl.max = "1440";
      text.inputEl.step = "1";
      text.setValue(String(this.plugin.settings.autoSyncIntervalMinutes));
      text.onChange(async (value) => {
        this.plugin.settings.autoSyncIntervalMinutes = Math.round(clampNumber(value, 1, 1440, 15));
        this.plugin.lastAutoAttemptAt = 0;
        await this.plugin.persistSettings();
      });
    });
    new import_obsidian.Setting(containerEl).setName(this.plugin.t("attachments.name")).setDesc(this.plugin.t("attachments.desc")).addToggle((toggle) => toggle.setValue(this.plugin.settings.syncAttachments).onChange(async (value) => {
      this.plugin.settings.syncAttachments = value;
      await this.plugin.persistSettings();
    }));
    new import_obsidian.Setting(containerEl).setName(this.plugin.t("maxAttachment.name")).setDesc(this.plugin.t("maxAttachment.desc", { limit: SERVER_MAX_ATTACHMENT_MIB })).addText((text) => {
      text.inputEl.type = "number";
      text.inputEl.min = "1";
      text.inputEl.max = String(SERVER_MAX_ATTACHMENT_MIB);
      text.inputEl.step = "0.5";
      text.setValue(String(this.plugin.settings.maxAttachmentMiB));
      text.onChange(async (value) => {
        this.plugin.settings.maxAttachmentMiB = clampNumber(value, 1, SERVER_MAX_ATTACHMENT_MIB, 8);
        await this.plugin.persistSettings();
      });
    });
    new import_obsidian.Setting(containerEl).setName(this.plugin.t("testConnection.name")).addButton((button) => button.setButtonText(this.plugin.t("testConnection.button")).onClick(async () => {
      try {
        await this.plugin.testConnection();
        new import_obsidian.Notice(this.plugin.t("notice.connectionSuccess"));
      } catch (error) {
        new import_obsidian.Notice(this.plugin.t("generic.errorPrefix", { message: String((error == null ? void 0 : error.message) || error) }));
      }
    }));
    new import_obsidian.Setting(containerEl).setName(this.plugin.t("fullSync.name")).setDesc(this.plugin.t("fullSync.desc")).addButton((button) => button.setButtonText(this.plugin.t("fullSync.button")).onClick(() => {
      this.plugin.runPreferredSync(true);
    }));
    new import_obsidian.Setting(containerEl).setName(this.plugin.t("transfer.heading")).setHeading();
    containerEl.createEl("p", {
      text: this.plugin.t("transfer.intro")
    });
    new import_obsidian.Setting(containerEl).setName(this.plugin.t("transfer.create.name")).setDesc(this.plugin.t("transfer.create.desc")).addButton((button) => button.setButtonText(this.plugin.t("transfer.create.button")).onClick(async () => {
      const passphrase = await openPassphraseModal(this.app, this.plugin.t, {
        title: this.plugin.t("transfer.create.modalTitle"),
        description: this.plugin.t("transfer.create.modalDesc"),
        confirm: true,
        submitText: this.plugin.t("transfer.create.submit")
      });
      if (passphrase === null) return;
      try {
        const link = await this.plugin.createTransferLink(passphrase);
        await copyText(link);
        new import_obsidian.Notice(this.plugin.t("notice.linkCopied"));
      } catch (error) {
        new import_obsidian.Notice(this.plugin.t("generic.errorPrefix", { message: String((error == null ? void 0 : error.message) || error) }));
      }
    }));
    new import_obsidian.Setting(containerEl).setName(this.plugin.t("transfer.import.name")).setDesc(this.plugin.t("transfer.import.desc")).addButton((button) => button.setButtonText(this.plugin.t("transfer.import.button")).onClick(async () => {
      const link = await openPasteLinkModal(this.app, this.plugin.t);
      if (link === null) return;
      try {
        await this.plugin.handleTransferImport(this.plugin.parseTransferLink(link));
        this.display();
      } catch (error) {
        new import_obsidian.Notice(this.plugin.t("generic.errorPrefix", { message: String((error == null ? void 0 : error.message) || error) }));
      }
    }));
  }
};
var PassphraseModal = class extends import_obsidian.Modal {
  constructor(app, t, options, resolve) {
    super(app);
    this.t = t;
    this.options = options;
    this.resolve = resolve;
    this.settled = false;
  }
  finish(value) {
    if (this.settled) return;
    this.settled = true;
    this.resolve(value);
    this.close();
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: this.options.title });
    contentEl.createEl("p", { text: this.options.description });
    let first = "";
    let second = "";
    const firstSetting = new import_obsidian.Setting(contentEl).setName(this.t("passphrase.label")).addText((text) => {
      text.inputEl.type = "password";
      text.onChange((value) => {
        first = value;
      });
      window.setTimeout(() => text.inputEl.focus(), 0);
    });
    if (this.options.confirm) {
      new import_obsidian.Setting(contentEl).setName(this.t("passphrase.repeat")).addText((text) => {
        text.inputEl.type = "password";
        text.onChange((value) => {
          second = value;
        });
      });
    }
    const submit = () => {
      if (first.length < 8) {
        new import_obsidian.Notice(this.t("notice.passphraseShort"));
        return;
      }
      if (this.options.confirm && first !== second) {
        new import_obsidian.Notice(this.t("notice.passphraseMismatch"));
        return;
      }
      this.finish(first);
    };
    firstSetting.settingEl.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !this.options.confirm) submit();
    });
    new import_obsidian.Setting(contentEl).addButton((button) => button.setButtonText(this.t("button.cancel")).onClick(() => this.finish(null))).addButton((button) => button.setCta().setButtonText(this.options.submitText).onClick(submit));
  }
  onClose() {
    this.contentEl.empty();
    if (!this.settled) {
      this.settled = true;
      this.resolve(null);
    }
  }
};
var PasteLinkModal = class extends import_obsidian.Modal {
  constructor(app, t, resolve) {
    super(app);
    this.t = t;
    this.resolve = resolve;
    this.settled = false;
  }
  finish(value) {
    if (this.settled) return;
    this.settled = true;
    this.resolve(value);
    this.close();
  }
  onOpen() {
    this.contentEl.createEl("h2", { text: this.t("transfer.import.modalTitle") });
    let value = "";
    new import_obsidian.Setting(this.contentEl).addTextArea((area) => {
      area.inputEl.rows = 6;
      area.onChange((next) => {
        value = next.trim();
      });
      window.setTimeout(() => area.inputEl.focus(), 0);
    });
    new import_obsidian.Setting(this.contentEl).addButton((button) => button.setButtonText(this.t("button.cancel")).onClick(() => this.finish(null))).addButton((button) => button.setCta().setButtonText(this.t("transfer.import.continue")).onClick(() => {
      if (!value) {
        new import_obsidian.Notice(this.t("notice.pasteFirst"));
        return;
      }
      this.finish(value);
    }));
  }
  onClose() {
    this.contentEl.empty();
    if (!this.settled) {
      this.settled = true;
      this.resolve(null);
    }
  }
};
var ConfirmModal = class extends import_obsidian.Modal {
  constructor(app, t, title, message, resolve) {
    super(app);
    this.t = t;
    this.title = title;
    this.message = message;
    this.resolve = resolve;
    this.settled = false;
  }
  finish(value) {
    if (this.settled) return;
    this.settled = true;
    this.resolve(value);
    this.close();
  }
  onOpen() {
    this.contentEl.createEl("h2", { text: this.title });
    this.contentEl.createEl("p", { text: this.message });
    new import_obsidian.Setting(this.contentEl).addButton((button) => button.setButtonText(this.t("button.cancel")).onClick(() => this.finish(false))).addButton((button) => button.setWarning().setButtonText(this.t("button.importAnyway")).onClick(() => this.finish(true)));
  }
  onClose() {
    this.contentEl.empty();
    if (!this.settled) {
      this.settled = true;
      this.resolve(false);
    }
  }
};
function openPassphraseModal(app, t, options) {
  return new Promise((resolve) => new PassphraseModal(app, t, options, resolve).open());
}
function openPasteLinkModal(app, t) {
  return new Promise((resolve) => new PasteLinkModal(app, t, resolve).open());
}
function openConfirmModal(app, t, title, message) {
  return new Promise((resolve) => new ConfirmModal(app, t, title, message, resolve).open());
}
var main_default = AIBridgePlugin;
