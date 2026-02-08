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
curl -fsSL https://github.com/kestiny18/Lydia/releases/latest/download/install.sh | bash
```

```powershell
irm https://github.com/kestiny18/Lydia/releases/latest/download/install.ps1 | iex
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
6. Internal dogfooding complete (see pre-release plan)
7. Alpha pre-release published on GitHub

## Notes
- Script install uses npm global install and runs `lydia init` by default.
- There is no standalone installer yet; this will be updated when we ship a native binary.
- Pre-release process: [docs/implementation/pre-release-plan.md](./implementation/pre-release-plan.md)
