$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true

# Run this with PowerShell, before any npm or JavaScript Action. Downloads use
# .NET, and pinned archive digests are checked before Node can execute.
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$version = (Get-Content (Join-Path $repo '.node-version') -Raw).Trim()
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid pinned Node version' }
if ([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -ne 'X64') { throw 'CI supports x64 runners only' }
if (-not $env:RUNNER_TEMP) { throw 'RUNNER_TEMP is required' }
$platform = if ($IsWindows) { 'win-x64' } elseif ($IsLinux) { 'linux-x64' } else { throw 'Unsupported runner OS' }
$extension = if ($IsWindows) { 'zip' } else { 'tar.xz' }
$name = "node-v$version-$platform"
$archiveName = "$name.$extension"
$checksums = @(Get-Content (Join-Path $PSScriptRoot 'node-runtime-sha256.txt') | Where-Object { $_ -match ('  ' + [regex]::Escape($archiveName) + '$') })
if ($checksums.Count -ne 1) { throw "No unique pinned checksum for $archiveName" }
$expected = $checksums[0].Split(' ')[0]
$destination = Join-Path $env:RUNNER_TEMP 'context-anywhere-node'
New-Item -ItemType Directory -Force -Path $destination | Out-Null
$archive = Join-Path $destination $archiveName
Invoke-WebRequest -Uri "https://nodejs.org/dist/v$version/$archiveName" -OutFile $archive
if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'Node archive checksum mismatch; refusing to execute it' }
if ($IsWindows) { Expand-Archive -LiteralPath $archive -DestinationPath $destination -Force }
else { & tar -xJf $archive -C $destination }
$bin = if ($IsWindows) { Join-Path $destination $name } else { Join-Path (Join-Path $destination $name) 'bin' }
$node = Join-Path $bin $(if ($IsWindows) { 'node.exe' } else { 'node' })
if ((& $node --version).Trim() -ne "v$version") { throw 'Extracted Node version does not match the pin' }
$bin | Out-File -LiteralPath $env:GITHUB_PATH -Append -Encoding utf8
"CI_NODE=$node" | Out-File -LiteralPath $env:GITHUB_ENV -Append -Encoding utf8
Write-Output "Verified Node $version ($platform)"
