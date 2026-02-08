param(
  [string]$Version,
  [switch]$NoInit,
  [switch]$NoStart,
  [string]$Registry,
  [string]$Prefix,
  [switch]$Help
)

$ErrorActionPreference = "Stop"

if ($Help) {
  Write-Host "Usage: install.ps1 [-Version <semver|tag>] [-NoInit] [-NoStart] [-Registry <url>] [-Prefix <path>]"
  exit 0
}

$logDir = Join-Path $HOME ".lydia"
$logFile = Join-Path $logDir "install.log"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Write-Log {
  param([string]$Message)
  $Message | Tee-Object -FilePath $logFile -Append
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Log "Node.js 18+ is required. Please install Node.js and try again."
  exit 1
}

$nodeVersion = & node -p "process.versions.node" 2>$null
if (-not $nodeVersion) {
  Write-Log "Unable to detect Node.js version."
  exit 1
}

$major = [int]($nodeVersion.Split('.')[0])
if ($major -lt 18) {
  Write-Log "Node.js 18+ is required. Detected Node $major."
  exit 1
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Log "npm is required. Please install npm and try again."
  exit 1
}

$pkg = "@lydia/cli"
if ($Version) {
  $pkg = "$pkg@$Version"
}

$npmArgs = @("install", "-g", $pkg)
if ($Registry) {
  $npmArgs += "--registry"
  $npmArgs += $Registry
}
if ($Prefix) {
  $npmArgs += "--prefix"
  $npmArgs += $Prefix
}

Write-Log "Installing $pkg..."
& npm @npmArgs

if ($Prefix) {
  $binDir = Join-Path $Prefix "bin"
} else {
  try {
    $binDir = (& npm bin -g).Trim()
  } catch {
    $binDir = (& npm prefix -g).Trim()
  }
  if (-not $binDir) {
    $binDir = Join-Path $env:APPDATA "npm"
  }
}

$lydiaCmd = "lydia"
if (-not (Get-Command lydia -ErrorAction SilentlyContinue)) {
  $candidate = Join-Path $binDir "lydia.cmd"
  if (-not (Test-Path $candidate)) {
    $candidate = Join-Path $binDir "lydia"
  }
  if (Test-Path $candidate) {
    $lydiaCmd = $candidate
  } else {
    Write-Log "Lydia CLI not found on PATH."
    Write-Log "Add this to your PATH: $binDir"
    Write-Log "Then run: lydia init"
    exit 1
  }
}

if (-not $NoInit) {
  Write-Log "Running lydia init..."
  & $lydiaCmd init
}

if (-not $NoStart) {
  Write-Log "Starting dashboard..."
  & $lydiaCmd dashboard
}

Write-Log "Install complete. Log saved to $logFile"
