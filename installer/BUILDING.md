# Building the Windows setup app

Use Windows x64 with the .NET Framework C# compiler and the Node version in
the repository's `.node-version`. From the repository root, run:

```powershell
npm ci
npm --prefix worker ci
npm --prefix installer ci
npm run check
npm run test:installer
npm run package:windows
npm --prefix installer run test:ui
```

Packaging rebuilds the plugin, backend and Worker payload from source and
creates `installer/dist/Context-Anywhere-<version>-win-x64.zip` with its checksum.
The setup version comes from `installer/package.json`. Keep npm install scripts
enabled. The build instructions and test files are not included in the ZIP.

To keep an open build available while packaging another candidate, pass
`-OutputDirectory <path>` to `scripts/package.ps1`. Only the versioned generated
bundle inside that directory is rebuilt; the default remains `installer/dist`.

The app icon source is `native/assets/context-anywhere.svg`. Packaging runs
`scripts/build-icon.ps1` to regenerate the preview PNG and Windows ICO (16, 20,
24, 32, 40, 48, 64, 128 and 256 px) from that SVG without external tools. The ICO
is embedded both as the executable's Windows icon and as `ContextAnywhere.Icon.ico`
for the WPF window and in-app branding.
