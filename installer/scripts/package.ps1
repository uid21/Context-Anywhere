param([string]$NodeVersion)
$ErrorActionPreference = 'Stop'
$setupRoot = Split-Path -Parent $PSScriptRoot
$setupPinnedVersion = (Get-Content -LiteralPath (Join-Path (Split-Path -Parent $setupRoot) '.node-version') -Raw).Trim()
if (-not $NodeVersion) { $NodeVersion = $setupPinnedVersion }
if ($NodeVersion -ne $setupPinnedVersion) { throw 'NodeVersion must match the reviewed runtime in .node-version.' }
$setupVersion = (Get-Content -LiteralPath (Join-Path $setupRoot 'package.json') -Raw | ConvertFrom-Json).version
$setupDist = Join-Path $setupRoot 'dist'
$setupBundle = Join-Path $setupDist "Context-Anywhere-$setupVersion-win-x64"
$setupTools = Join-Path $setupRoot '.tools'
New-Item -ItemType Directory -Force -Path $setupTools | Out-Null
$setupArchive = "node-v$NodeVersion-win-x64.zip"
$setupNodeZip = Join-Path $setupTools $setupArchive
$setupNodeUrl = "https://nodejs.org/dist/v$NodeVersion"
function Get-SetupHash([string]$LiteralPath) {
  $setupStream = [IO.File]::OpenRead($LiteralPath)
  $setupAlgorithm = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($setupAlgorithm.ComputeHash($setupStream))).Replace('-', '').ToLowerInvariant() }
  finally { $setupStream.Dispose(); $setupAlgorithm.Dispose() }
}
function Get-SetupExpectedHash([string]$Checksums) {
  $setupMatches = @($Checksums -split "`n" | Where-Object { $_ -match ('^[a-fA-F0-9]{64}\s+' + [regex]::Escape($setupArchive) + '\s*$') })
  if ($setupMatches.Count -ne 1) { throw 'Expected exactly one checksum for the pinned Node.js archive.' }
  return ($setupMatches[0] -split '\s+')[0].ToLowerInvariant()
}
function Assert-SetupRuntime([string]$LiteralPath) {
  $setupActualVersion = & $LiteralPath --version
  if ($LASTEXITCODE -ne 0 -or $setupActualVersion -ne "v$NodeVersion") { throw "Packaged Node.js version mismatch: $setupActualVersion" }
}
$setupPinnedHash = Get-SetupExpectedHash (Get-Content -LiteralPath (Join-Path $setupRoot 'node-runtime-sha256.txt') -Raw)
if (-not (Test-Path -LiteralPath $setupNodeZip)) { Invoke-WebRequest -UseBasicParsing -Uri "$setupNodeUrl/$setupArchive" -OutFile $setupNodeZip }
$setupChecksums = (Invoke-WebRequest -UseBasicParsing -Uri "$setupNodeUrl/SHASUMS256.txt").Content
$setupExpected = Get-SetupExpectedHash $setupChecksums
if ($setupExpected -ne $setupPinnedHash -or (Get-SetupHash $setupNodeZip) -ne $setupPinnedHash) { throw 'Node.js checksum verification failed.' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
# Rebuild from current source with the verified runtime, even when an old bundle exists.
$setupBuildRuntime = Join-Path $setupTools "build-node-$NodeVersion.exe"
$setupZip = [IO.Compression.ZipFile]::OpenRead($setupNodeZip)
try {
  [IO.Compression.ZipFileExtensions]::ExtractToFile($setupZip.GetEntry("node-v$NodeVersion-win-x64/node.exe"), $setupBuildRuntime, $true)
} finally { $setupZip.Dispose() }
Assert-SetupRuntime $setupBuildRuntime
Push-Location (Split-Path -Parent $setupRoot)
try {
  & $setupBuildRuntime esbuild.config.mjs production
  if ($LASTEXITCODE -ne 0) { throw 'Plugin build failed.' }
  & $setupBuildRuntime (Join-Path $PSScriptRoot 'build.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'Setup backend/Worker build failed.' }
} finally { Pop-Location }
New-Item -ItemType Directory -Force -Path (Join-Path $setupBundle 'runtime') | Out-Null
# Read executable bytes from the verified archive on every build, not a previously extracted cache.
$setupZip = [IO.Compression.ZipFile]::OpenRead($setupNodeZip)
try {
  foreach ($setupFile in @('node.exe', 'LICENSE')) {
    $setupEntry = $setupZip.GetEntry("node-v$NodeVersion-win-x64/$setupFile")
    if (-not $setupEntry) { throw "Missing Node.js archive entry: $setupFile" }
    [IO.Compression.ZipFileExtensions]::ExtractToFile($setupEntry, (Join-Path $setupBundle "runtime\$setupFile"), $true)
  }
} finally { $setupZip.Dispose() }
$setupRuntime = Join-Path $setupBundle 'runtime\node.exe'
Assert-SetupRuntime $setupRuntime
$setupRuntimeHash = Get-SetupHash $setupRuntime
$setupFramework = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319'
$setupCompiler = Join-Path $setupFramework 'csc.exe'
& $setupCompiler /nologo /target:winexe /platform:x64 /optimize+ "/out:$setupBundle\ContextAnywhere.exe" "/win32manifest:$setupRoot\native\app.manifest" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll /reference:System.Xaml.dll "/reference:$setupFramework\WPF\WindowsBase.dll" "/reference:$setupFramework\WPF\PresentationCore.dll" "/reference:$setupFramework\WPF\PresentationFramework.dll" "/resource:$setupRoot\native\Theme.xaml,ContextAnywhere.Theme.xaml" "$setupRoot\native\Setup.cs" "$setupRoot\native\Rpc.cs" "$setupRoot\native\Localization.cs"
if ($LASTEXITCODE -ne 0) { throw 'Native Windows executable compilation failed.' }
$setupExecutableInfo = [Diagnostics.FileVersionInfo]::GetVersionInfo((Join-Path $setupBundle 'ContextAnywhere.exe'))
if ($setupExecutableInfo.FileVersion -ne "$setupVersion.0" -or $setupExecutableInfo.ProductVersion -ne $setupVersion) { throw 'Native executable version does not match installer/package.json.' }
$setupRelease = Join-Path $setupDist "Context-Anywhere-$setupVersion-win-x64.zip"
if (Test-Path -LiteralPath $setupRelease) { Remove-Item -LiteralPath $setupRelease }
[IO.Compression.ZipFile]::CreateFromDirectory($setupBundle, $setupRelease, [IO.Compression.CompressionLevel]::Optimal, $true)
# Compare every delivered file with the fresh build and exercise the extracted deliverable.
$setupVerification = Join-Path $setupTools ("verify-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $setupVerification | Out-Null
$setupVerifiedBundle = Join-Path $setupVerification (Split-Path -Leaf $setupBundle)
$setupVerificationNode = Join-Path $setupVerifiedBundle 'runtime\node.exe'
$setupPreviousBundle = $env:CA_TEST_BUNDLE
$setupPreviousPayload = $env:CA_TEST_PAYLOAD
try {
  $setupZip = [IO.Compression.ZipFile]::OpenRead($setupRelease)
  try {
    $setupBuiltFiles = @(Get-ChildItem -LiteralPath $setupBundle -File -Recurse)
    if ($setupZip.Entries.Count -ne $setupBuiltFiles.Count) { throw 'Unexpected file count in final ZIP.' }
    foreach ($setupFile in $setupBuiltFiles) {
      $setupRelative = $setupFile.FullName.Substring($setupBundle.Length + 1).Replace('\', '/')
      $setupEntryName = "$(Split-Path -Leaf $setupBundle)/$setupRelative"
      $setupEntries = @($setupZip.Entries | Where-Object { $_.FullName.Replace('\', '/') -ceq $setupEntryName })
      if ($setupEntries.Count -ne 1) { throw "Missing or duplicate ZIP entry: $setupRelative" }
      $setupStream = $setupEntries[0].Open()
      $setupAlgorithm = [Security.Cryptography.SHA256]::Create()
      try { $setupEntryHash = ([BitConverter]::ToString($setupAlgorithm.ComputeHash($setupStream))).Replace('-', '').ToLowerInvariant() }
      finally { $setupStream.Dispose(); $setupAlgorithm.Dispose() }
      if ($setupEntryHash -ne (Get-SetupHash $setupFile.FullName)) { throw "ZIP differs from current build: $setupRelative" }
    }
  } finally { $setupZip.Dispose() }
  [IO.Compression.ZipFile]::ExtractToDirectory($setupRelease, $setupVerification)
  if ((Get-SetupHash $setupVerificationNode) -ne $setupRuntimeHash) { throw 'The final ZIP runtime checksum does not match the verified executable.' }
  Assert-SetupRuntime $setupVerificationNode
  $env:CA_TEST_BUNDLE = $setupVerifiedBundle
  $env:CA_TEST_PAYLOAD = Join-Path $setupVerifiedBundle 'payload\index.js'
  $setupRepo = Split-Path -Parent $setupRoot
  & $setupVerificationNode --test (Join-Path $setupRepo 'worker\test\undici-security.test.js')
  if ($LASTEXITCODE -ne 0) { throw 'Final ZIP runtime security regression failed.' }
  & $setupVerificationNode --test (Join-Path $setupRoot 'integration\packaged.test.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'Final ZIP setup integration failed.' }
  & $setupVerificationNode --test '--test-name-pattern=built Worker' (Join-Path $setupRepo 'worker\integration\toolchain.test.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'Final ZIP Worker integration failed.' }
  & $setupVerificationNode --test (Join-Path $setupRepo 'worker\integration\mcp-security.test.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'Final ZIP OAuth/MCP security integration failed.' }
  Write-Output "Verified $($setupBuiltFiles.Count) final ZIP files and runtime: Node.js $NodeVersion ($setupRuntimeHash)"
} finally {
  $env:CA_TEST_BUNDLE = $setupPreviousBundle
  $env:CA_TEST_PAYLOAD = $setupPreviousPayload
  $setupResolvedVerification = [IO.Path]::GetFullPath($setupVerification)
  if ((Split-Path -Parent $setupResolvedVerification) -ne [IO.Path]::GetFullPath($setupTools) -or (Split-Path -Leaf $setupResolvedVerification) -notmatch '^verify-[a-f0-9]{32}$') { throw 'Unexpected verification cleanup path.' }
  Remove-Item -LiteralPath $setupResolvedVerification -Recurse -Force
}
$setupHash = Get-SetupHash $setupRelease
Set-Content -LiteralPath (Join-Path $setupDist 'SHA256SUMS.txt') -Value "$setupHash  $(Split-Path -Leaf $setupRelease)" -Encoding ascii
Write-Output $setupRelease
