# Release and Install Guide

This document describes how to package, install, and verify a Lydia MVP release.

## Install Options

### Option 1: Repo Install (Recommended for now)
```bash
git clone https://github.com/kestiny18/Lydia.git
cd Lydia
pnpm install
pnpm build
```

### Option 2: Install Script
```bash
./scripts/install.sh
```

```powershell
.\scripts\install.ps1
```

## One-Click Init
```bash
pnpm tsx packages/cli/src/index.ts init
```

This creates:
- `~/.lydia/config.json`
- `~/.lydia/strategies/default.yml`
- `~/.lydia/skills/`

## Release Checklist (MVP)
1. `pnpm -r run test`
2. `pnpm build`
3. `pnpm tsx packages/cli/src/index.ts init`
4. `pnpm tsx packages/cli/src/index.ts run "check git status"`
5. `pnpm tsx packages/cli/src/index.ts dashboard`

## Notes
- There is no standalone installer yet.
- When we add a packaged installer, this document will be updated.
