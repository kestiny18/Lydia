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

pnpm --filter @lydia-agent/cli --config.node-linker=hoisted deploy --prod --legacy $appDir

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
  "lydia-tray.cmd" = @'
@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0lydia-tray.ps1" %*
'@;
  "lydia-shutdown.cmd" = @'
@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0lydia-tray.ps1" -Shutdown
call "%~dp0lydia.cmd" stop >nul 2>&1
'@;
  "lydia-tray.ps1" = @'
param(
  [switch]$Shutdown,
  [switch]$OpenDashboard
)

$ErrorActionPreference = "SilentlyContinue"
$baseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$shutdownEventName = "Local\LydiaTrayShutdown"
$mutexName = "Local\LydiaTraySingleton"

function New-ShutdownEvent($createdNew = $false) {
  return New-Object System.Threading.EventWaitHandle($createdNew, [System.Threading.EventResetMode]::ManualReset, $shutdownEventName)
}

if ($Shutdown) {
  try {
    $event = New-ShutdownEvent
    $null = $event.Set()
    Start-Sleep -Milliseconds 1200
    $event.Dispose()
  } catch {}
  exit 0
}

$createdNew = $false
$mutex = New-Object System.Threading.Mutex($true, $mutexName, [ref]$createdNew)
if (-not $createdNew) {
  if ($OpenDashboard) {
    Start-Process "http://127.0.0.1:15536"
  }
  exit 0
}

$shutdownEvent = New-ShutdownEvent $true

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

function Invoke-LydiaCommand([string[]]$Arguments) {
  Start-Process -FilePath (Join-Path $baseDir "lydia.cmd") -ArgumentList $Arguments -WindowStyle Hidden
}

function Start-LydiaService {
  Invoke-LydiaCommand @("start")
}

function Stop-LydiaService {
  Invoke-LydiaCommand @("stop")
}

function Open-LydiaDashboard {
  Start-LydiaService
  Start-Process "http://127.0.0.1:15536"
}

function Get-LydiaStatus {
  try {
    $status = Invoke-RestMethod -Uri "http://127.0.0.1:15536/api/status" -TimeoutSec 2
    return @{
      Running = $true
      Healthy = $true
      Label = "Status: Running"
      Tip = "Lydia is running on port 15536."
    }
  } catch {
    return @{
      Running = $false
      Healthy = $false
      Label = "Status: Stopped"
      Tip = "Lydia is stopped."
    }
  }
}

$notifyIcon = New-Object System.Windows.Forms.NotifyIcon
$notifyIcon.Icon = [System.Drawing.SystemIcons]::Application
$notifyIcon.Visible = $true
$notifyIcon.Text = "Lydia"

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$statusItem = $menu.Items.Add("Status: Starting")
$statusItem.Enabled = $false
$menu.Items.Add("-") | Out-Null
$dashboardItem = $menu.Items.Add("Dashboard")
$startItem = $menu.Items.Add("Run Lydia")
$stopItem = $menu.Items.Add("Stop Lydia")
$menu.Items.Add("-") | Out-Null
$exitItem = $menu.Items.Add("Exit Tray")
$notifyIcon.ContextMenuStrip = $menu

$dashboardItem.add_Click({ Open-LydiaDashboard })
$startItem.add_Click({
  Start-LydiaService
  $notifyIcon.ShowBalloonTip(1500, "Lydia", "Starting Lydia...", [System.Windows.Forms.ToolTipIcon]::Info)
})
$stopItem.add_Click({
  Stop-LydiaService
  $notifyIcon.ShowBalloonTip(1500, "Lydia", "Stopping Lydia...", [System.Windows.Forms.ToolTipIcon]::Info)
})
$exitItem.add_Click({
  $notifyIcon.Visible = $false
  [System.Windows.Forms.Application]::Exit()
})
$notifyIcon.add_DoubleClick({ Open-LydiaDashboard })

function Update-TrayState {
  $state = Get-LydiaStatus
  $statusItem.Text = $state.Label
  $notifyIcon.Text = $state.Tip.Substring(0, [Math]::Min(63, $state.Tip.Length))
  $startItem.Enabled = -not $state.Running
  $stopItem.Enabled = $state.Running
}

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 3000
$timer.add_Tick({
  if ($shutdownEvent.WaitOne(0)) {
    $timer.Stop()
    $notifyIcon.Visible = $false
    [System.Windows.Forms.Application]::Exit()
    return
  }
  Update-TrayState
})

Start-LydiaService
Update-TrayState
$timer.Start()

if ($OpenDashboard) {
  Open-LydiaDashboard
}

[System.Windows.Forms.Application]::Run()

$timer.Stop()
$notifyIcon.Visible = $false
$shutdownEvent.Dispose()
$mutex.ReleaseMutex()
$mutex.Dispose()
'@;
}

foreach ($name in $launchers.Keys) {
  Set-Content -Path (Join-Path $resolvedOutput $name) -Value $launchers[$name] -Encoding Ascii
}

$version = (Get-Content (Join-Path $repoRoot "packages\cli\package.json") | ConvertFrom-Json).version
Set-Content -Path (Join-Path $resolvedOutput "VERSION.txt") -Value $version -Encoding Ascii

Write-Host "Windows bundle staged at $resolvedOutput"
