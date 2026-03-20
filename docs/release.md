# Release and Install Guide

This document describes how to package, install, and verify a Lydia MVP release.

## Install Options

### Option 1: Developer CLI Install
```bash
npm install -g @lydia-agent/cli
lydia init
lydia start
lydia dashboard
```

```bash
pnpm add -g @lydia-agent/cli
lydia init
lydia start
lydia dashboard
```

Default local URL:
- `http://127.0.0.1:15536`

### Option 2: Windows Installer
Download `Lydia-Setup-<version>.exe` from GitHub Releases.

The installer:
- Bundles the local runtime
- Installs Lydia for the current user
- Registers auto-start on login
- Starts the local service and opens the dashboard

### Option 3: Repo Install
```bash
git clone https://github.com/kestiny18/Lydia.git
cd Lydia
pnpm install
pnpm build
node packages/cli/dist/index.js init
node packages/cli/dist/index.js start
```

### Option 4: Install Script
```bash
curl -fsSL https://github.com/kestiny18/Lydia/releases/latest/download/install.sh | bash
```

```powershell
irm https://github.com/kestiny18/Lydia/releases/latest/download/install.ps1 | iex
```

## One-Click Init
```bash
lydia init
```

This creates:
- `~/.lydia/config.json`
- `~/.lydia/strategies/default.yml`
- `~/.lydia/skills/`
- `~/.lydia/data/`
- `~/.lydia/logs/`
- `~/.lydia/run/`

## Release Checklist (MVP)
1. `pnpm -r run test`
2. `pnpm build`
3. `node packages/cli/dist/index.js init`
4. `node packages/cli/dist/index.js start`
5. `node packages/cli/dist/index.js status`
6. `node packages/cli/dist/index.js stop`
7. `pnpm --filter @lydia-agent/cli deploy --prod --legacy .release/smoke-cli`
8. `node .release/smoke-cli/dist/index.js doctor`
9. Internal dogfooding complete (see pre-release plan)
10. Alpha pre-release published on GitHub

## Notes
- Script install uses npm global install and runs `lydia init` by default.
- Windows installer ships a browser-first local app. It does not use Electron.
- The release workflows live in `.github/workflows/`.
- Pre-release process: [docs/implementation/pre-release-plan.md](./implementation/pre-release-plan.md)
