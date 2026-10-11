param([string]$OutputDirectory)
$ErrorActionPreference='Stop'
$setupRoot=Split-Path -Parent $PSScriptRoot
$setupVersion=(Get-Content (Join-Path $setupRoot 'package.json') -Raw|ConvertFrom-Json).version
if(-not $OutputDirectory){$OutputDirectory=Join-Path $env:TEMP "ContextAnywhere-UiSmoke-$setupVersion"}
$setupBundle=Join-Path $setupRoot "dist\Context-Anywhere-$setupVersion-win-x64"
$setupOutput=[IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Force -Path $setupOutput|Out-Null
foreach($setupPart in @('app','runtime','payload')) {
  if(-not(Test-Path -LiteralPath (Join-Path $setupOutput $setupPart))) {
    New-Item -ItemType Junction -Path (Join-Path $setupOutput $setupPart) -Target (Join-Path $setupBundle $setupPart)|Out-Null
  }
}
$setupFramework=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319'
& "$setupFramework\csc.exe" /nologo /target:winexe /platform:x64 /main:UiSmoke "/out:$setupOutput\UiSmoke.exe" "/win32manifest:$setupRoot\native\app.manifest" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll /reference:System.Xaml.dll "/reference:$setupFramework\WPF\WindowsBase.dll" "/reference:$setupFramework\WPF\PresentationCore.dll" "/reference:$setupFramework\WPF\PresentationFramework.dll" "/resource:$setupRoot\native\Theme.xaml,ContextAnywhere.Theme.xaml" "$setupRoot\native\Setup.cs" "$setupRoot\native\Rpc.cs" "$setupRoot\test\UiSmoke.cs"
if($LASTEXITCODE -ne 0){throw 'UI test compilation failed'}
$env:CA_UI_OUTPUT=$setupOutput
$env:CA_SETUP_DATA_DIR=Join-Path $setupOutput 'state'
$setupErrorFile=Join-Path $setupOutput 'ui-error.txt'
if(Test-Path -LiteralPath $setupErrorFile){Remove-Item -LiteralPath $setupErrorFile}
$setupRun=Start-Process -FilePath "$setupOutput\UiSmoke.exe" -WindowStyle Hidden -PassThru
if(-not $setupRun.WaitForExit(30000)){$setupRun.Kill();throw 'UI test timed out'}
if(Test-Path -LiteralPath $setupErrorFile){Get-Content -LiteralPath $setupErrorFile;throw 'UI test failed'}
if($setupRun.ExitCode -ne 0){throw "UI test exited with $($setupRun.ExitCode)"}
Get-Content "$setupOutput\ui-result.json"
