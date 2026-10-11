param([string]$NodeVersion = '22.23.3')
$ErrorActionPreference = 'Stop'
$setupRoot = Split-Path -Parent $PSScriptRoot
$setupVersion = (Get-Content -LiteralPath (Join-Path $setupRoot 'package.json') -Raw | ConvertFrom-Json).version
$setupDist = Join-Path $setupRoot 'dist'
$setupBundle = Join-Path $setupDist "Context-Anywhere-$setupVersion-win-x64"
$setupTools = Join-Path $setupRoot '.tools'
New-Item -ItemType Directory -Force -Path $setupTools | Out-Null
if (-not (Test-Path -LiteralPath (Join-Path $setupBundle 'app\bridge.mjs'))) { throw 'Run npm run build:installer first.' }
$setupArchive = "node-v$NodeVersion-win-x64.zip"
$setupNodeZip = Join-Path $setupTools $setupArchive
$setupNodeUrl = "https://nodejs.org/dist/v$NodeVersion"
function Get-SetupHash([string]$LiteralPath) {
  $setupStream = [IO.File]::OpenRead($LiteralPath)
  $setupAlgorithm = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($setupAlgorithm.ComputeHash($setupStream))).Replace('-', '').ToLowerInvariant() }
  finally { $setupStream.Dispose(); $setupAlgorithm.Dispose() }
}
if (-not (Test-Path -LiteralPath $setupNodeZip)) { Invoke-WebRequest -UseBasicParsing -Uri "$setupNodeUrl/$setupArchive" -OutFile $setupNodeZip }
$setupChecksums = (Invoke-WebRequest -UseBasicParsing -Uri "$setupNodeUrl/SHASUMS256.txt").Content
$setupExpected = (($setupChecksums -split "`n" | Where-Object { $_ -match ('\s+' + [regex]::Escape($setupArchive) + '\s*$') }) -split '\s+')[0]
if (-not $setupExpected -or (Get-SetupHash $setupNodeZip) -ne $setupExpected) { throw 'Node.js checksum verification failed.' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (-not (Test-Path -LiteralPath (Join-Path $setupTools "node-v$NodeVersion-win-x64\node.exe"))) {
  [IO.Compression.ZipFile]::ExtractToDirectory($setupNodeZip, $setupTools)
}
New-Item -ItemType Directory -Force -Path (Join-Path $setupBundle 'runtime') | Out-Null
Copy-Item -LiteralPath (Join-Path $setupTools "node-v$NodeVersion-win-x64\node.exe") -Destination (Join-Path $setupBundle 'runtime\node.exe')
Copy-Item -LiteralPath (Join-Path $setupTools "node-v$NodeVersion-win-x64\LICENSE") -Destination (Join-Path $setupBundle 'runtime\LICENSE')
$setupFramework = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319'
$setupCompiler = Join-Path $setupFramework 'csc.exe'
& $setupCompiler /nologo /target:winexe /platform:x64 /optimize+ "/out:$setupBundle\ContextAnywhere.exe" "/win32manifest:$setupRoot\native\app.manifest" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll /reference:System.Xaml.dll "/reference:$setupFramework\WPF\WindowsBase.dll" "/reference:$setupFramework\WPF\PresentationCore.dll" "/reference:$setupFramework\WPF\PresentationFramework.dll" "/resource:$setupRoot\native\Theme.xaml,ContextAnywhere.Theme.xaml" "$setupRoot\native\Setup.cs" "$setupRoot\native\Rpc.cs"
if ($LASTEXITCODE -ne 0) { throw 'Native Windows executable compilation failed.' }
$setupRelease = Join-Path $setupDist "Context-Anywhere-$setupVersion-win-x64.zip"
if (Test-Path -LiteralPath $setupRelease) { Remove-Item -LiteralPath $setupRelease }
[IO.Compression.ZipFile]::CreateFromDirectory($setupBundle, $setupRelease, [IO.Compression.CompressionLevel]::Optimal, $true)
$setupHash = Get-SetupHash $setupRelease
Set-Content -LiteralPath (Join-Path $setupDist 'SHA256SUMS.txt') -Value "$setupHash  $(Split-Path -Leaf $setupRelease)" -Encoding ascii
Write-Output $setupRelease
