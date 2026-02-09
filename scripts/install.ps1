param(
  [string]$Version,
  [switch]$NoInit,
  [switch]$NoStart,
  [string]$Registry,
  [string]$Prefix,
  [string]$Repo = "kestiny18/Lydia",
  [switch]$Help
)

$ErrorActionPreference = "Stop"

if ($Help) {
  Write-Host "Usage: install.ps1 [-Version <semver|tag>] [-NoInit] [-NoStart] [-Registry <url>] [-Prefix <path>] [-Repo <owner/name>]"
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

function Install-FromRegistry {
  $viewArgs = @("view", "@lydia/cli", "version")
  if ($Registry) { $viewArgs += @("--registry", $Registry) }

  & npm @viewArgs *> $null
  if ($LASTEXITCODE -ne 0) { return $false }

  $npmArgs = @("install", "-g", $pkg)
  if ($Registry) { $npmArgs += @("--registry", $Registry) }
  if ($Prefix) { $npmArgs += @("--prefix", $Prefix) }

  Write-Log "Installing $pkg from npm registry..."
  & npm @npmArgs
  return $true
}

function Install-FromSourceDir {
  param([Parameter(Mandatory = $true)][string]$SourceDir)

  if (-not (Get-Command corepack -ErrorAction SilentlyContinue)) {
    throw "corepack is required for source install (Node 18+)."
  }

  function Invoke-PnpmCmd {
    param([Parameter(Mandatory = $true)][string[]]$Args)
    & cmd /c pnpm @Args
    if ($LASTEXITCODE -ne 0) {
      throw "pnpm failed: pnpm $($Args -join ' ')"
    }
  }

  Write-Log "Building and installing from source: $SourceDir"
  Push-Location $SourceDir
  try {
    & corepack enable *> $null
    & corepack prepare pnpm@latest --activate *> $null

    Invoke-PnpmCmd -Args @("install", "--frozen-lockfile")
    Invoke-PnpmCmd -Args @("build")

    $localCli = Join-Path $SourceDir "packages\\cli"
    $npmArgs = @("install", "-g", $localCli)
    if ($Registry) { $npmArgs += @("--registry", $Registry) }
    if ($Prefix) { $npmArgs += @("--prefix", $Prefix) }
    & npm @npmArgs
  } finally {
    Pop-Location
  }
}

function Install-FromGitHub {
  $ref = if ($Version) { $Version } else { "main" }
  $url = "https://github.com/$Repo/archive/refs/heads/$ref.tar.gz"

  $tmpRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("lydia-" + [System.Guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Force -Path $tmpRoot | Out-Null
  $archive = Join-Path $tmpRoot "lydia.tgz"

  try {
    Write-Log "Downloading source from $Repo@$ref..."
    Invoke-WebRequest -Uri $url -OutFile $archive -UseBasicParsing

    tar -xzf $archive -C $tmpRoot
    $extracted = Get-ChildItem -Path $tmpRoot -Directory | Select-Object -First 1
    if (-not $extracted) {
      throw "Failed to extract source archive."
    }

    Install-FromSourceDir -SourceDir $extracted.FullName
  } finally {
    Remove-Item -Recurse -Force $tmpRoot -ErrorAction SilentlyContinue
  }
}

if (-not (Install-FromRegistry)) {
  $hereHasRepo = (Test-Path (Join-Path (Get-Location) "packages\\cli\\package.json")) -and (Test-Path (Join-Path (Get-Location) "pnpm-workspace.yaml"))
  if ($hereHasRepo) {
    Write-Log "Package @lydia/cli is not published; installing from local source checkout..."
    Install-FromSourceDir -SourceDir (Get-Location).Path
  } else {
    Write-Log "Package @lydia/cli is not published; installing from GitHub source..."
    Install-FromGitHub
  }
}

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
