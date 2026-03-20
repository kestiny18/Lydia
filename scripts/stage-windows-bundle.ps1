param(
  [string]$OutputRoot = ".release\windows\bundle"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$resolvedOutput = Join-Path $repoRoot $OutputRoot
$appDir = Join-Path $resolvedOutput "app"
$runtimeDir = Join-Path $resolvedOutput "runtime"

Remove-Item -Recurse -Force $resolvedOutput -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

pnpm --filter @lydia-agent/cli deploy --prod --legacy $appDir

$nodeCommand = Get-Command node -ErrorAction Stop
Copy-Item $nodeCommand.Source (Join-Path $runtimeDir "node.exe") -Force

$launchers = @{
  "lydia.cmd" = @'
@echo off
setlocal
"%~dp0runtime\node.exe" "%~dp0app\dist\index.js" %*
exit /b %ERRORLEVEL%
'@;
  "lydia-start.cmd" = @'
@echo off
call "%~dp0lydia.cmd" start
'@;
  "lydia-stop.cmd" = @'
@echo off
call "%~dp0lydia.cmd" stop
'@;
  "lydia-dashboard.cmd" = @'
@echo off
call "%~dp0lydia.cmd" start >nul 2>&1
start "" "http://127.0.0.1:15536"
'@;
}

foreach ($name in $launchers.Keys) {
  Set-Content -Path (Join-Path $resolvedOutput $name) -Value $launchers[$name] -Encoding Ascii
}

$version = (Get-Content (Join-Path $repoRoot "packages\cli\package.json") | ConvertFrom-Json).version
Set-Content -Path (Join-Path $resolvedOutput "VERSION.txt") -Value $version -Encoding Ascii

Write-Host "Windows bundle staged at $resolvedOutput"
