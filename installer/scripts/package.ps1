param([string]$NodeVersion = '22.23.3', [switch]$SkipInstaller, [switch]$PackageOnly, [string]$DistDirectory)
$ErrorActionPreference = 'Stop'
$setupRoot = Split-Path -Parent $PSScriptRoot
$setupDist = if ($DistDirectory) { [IO.Path]::GetFullPath($DistDirectory) } else { Join-Path $setupRoot 'dist' }
$setupTools = Join-Path $setupRoot '.tools'
New-Item -ItemType Directory -Force -Path $setupTools | Out-Null
if (-not (Test-Path -LiteralPath (Join-Path $setupDist 'app\bridge.mjs'))) { throw 'Run npm run build first.' }
$setupArchive = "node-v$NodeVersion-win-x64.zip"
$setupNodeZip = Join-Path $setupTools $setupArchive
$setupNodeUrl = "https://nodejs.org/dist/v$NodeVersion"
function Get-SetupHash([string]$LiteralPath) {
  $setupStream = [IO.File]::OpenRead($LiteralPath)
  $setupAlgorithm = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($setupAlgorithm.ComputeHash($setupStream))).Replace('-', '').ToLowerInvariant() }
  finally { $setupStream.Dispose(); $setupAlgorithm.Dispose() }
}
if (-not $PackageOnly) {
if (-not (Test-Path -LiteralPath $setupNodeZip)) { Invoke-WebRequest -UseBasicParsing -Uri "$setupNodeUrl/$setupArchive" -OutFile $setupNodeZip }
$setupChecksums = (Invoke-WebRequest -UseBasicParsing -Uri "$setupNodeUrl/SHASUMS256.txt").Content
$setupExpected = (($setupChecksums -split "`n" | Where-Object { $_ -match ('\s+' + [regex]::Escape($setupArchive) + '\s*$') }) -split '\s+')[0]
if (-not $setupExpected -or (Get-SetupHash $setupNodeZip) -ne $setupExpected) { throw 'Node.js checksum verification failed.' }
if (-not (Test-Path -LiteralPath (Join-Path $setupTools "node-v$NodeVersion-win-x64\node.exe"))) {
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  [IO.Compression.ZipFile]::ExtractToDirectory($setupNodeZip, $setupTools)
}
New-Item -ItemType Directory -Force -Path (Join-Path $setupDist 'runtime') | Out-Null
Copy-Item -LiteralPath (Join-Path $setupTools "node-v$NodeVersion-win-x64\node.exe") -Destination (Join-Path $setupDist 'runtime\node.exe')
Copy-Item -LiteralPath (Join-Path $setupTools "node-v$NodeVersion-win-x64\LICENSE") -Destination (Join-Path $setupDist 'runtime\LICENSE')
$setupCompiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
& $setupCompiler /nologo /target:winexe /platform:x64 /optimize+ "/out:$setupDist\ContextAnywhere.exe" "/win32manifest:$setupRoot\native\app.manifest" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll "$setupRoot\native\Setup.cs"
if ($LASTEXITCODE -ne 0) { throw 'Native Windows executable compilation failed.' }
}
if ($SkipInstaller) { return }
$setupMakensis = Get-Command makensis.exe -ErrorAction SilentlyContinue
if (-not $setupMakensis) {
  $setupNsisCandidates = @('C:\Program Files (x86)\NSIS\makensis.exe', (Join-Path $setupTools 'nsis\makensis.exe'))
  $setupNsisPath = $setupNsisCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if (-not $setupNsisPath) { throw 'Install NSIS 3.11 or set makensis.exe on PATH to produce the installer.' }
} else { $setupNsisPath = $setupMakensis.Source }
$setupVersion = (Get-Content -LiteralPath (Join-Path $setupRoot 'package.json') -Raw | ConvertFrom-Json).version
& $setupNsisPath /INPUTCHARSET UTF8 "/DVERSION=$setupVersion" "/DDIST=$setupDist" "$setupRoot\native\installer.nsi"
if ($LASTEXITCODE -ne 0) { throw 'Windows installer packaging failed.' }
$setupRelease = Join-Path $setupDist "Context-Anywhere-Setup-$setupVersion-x64.exe"
$setupHash = Get-SetupHash $setupRelease
Set-Content -LiteralPath (Join-Path $setupDist 'SHA256SUMS.txt') -Value "$setupHash  $(Split-Path -Leaf $setupRelease)" -Encoding ascii
Write-Output $setupRelease
