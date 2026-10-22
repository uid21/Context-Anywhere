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
