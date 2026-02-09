# Local Installation (One-Click Scripts)

## Background
Lydia is a local-first assistant. Today, onboarding requires Git + Node + pnpm and a repo clone.
That flow is too heavy for normal users. We need a one-command installer that sets up the CLI,
initializes the local config, and launches the dashboard without requiring a source checkout.

## Goals
- Single-command install on macOS, Linux, WSL, and Windows PowerShell.
- No Git clone for end users.
- Installs a `lydia` CLI on PATH.
- Runs `lydia init` by default and optionally starts the dashboard.
- Clear errors and recovery paths for common issues.
- Minimal assumptions about developer tooling.

## Non-Goals
- Native binary distribution (future phase).
- Full auto-updater (future phase).
- SaaS hosting or remote execution.
- Complex dependency bootstrapping beyond Node/npm in Phase A.

## Design

### Distribution Endpoints
Provide stable URLs via GitHub Releases:
- `https://github.com/kestiny18/Lydia/releases/latest/download/install.sh`
- `https://github.com/kestiny18/Lydia/releases/latest/download/install.ps1`

These are generated from the repo `scripts/` sources and published as part of release.

During pre-release development (before the first published release), you can also fetch the scripts
directly from the repo:
- `https://raw.githubusercontent.com/kestiny18/Lydia/main/scripts/install.sh`
- `https://raw.githubusercontent.com/kestiny18/Lydia/main/scripts/install.ps1`

### Install Strategy (Phase A)
Default installation is a global npm install of the published CLI package:
- `npm install -g @lydia/cli@<version>`

The CLI package must ship with prebuilt `dist/` so end users do not run TypeScript builds.

### install.sh Flow (macOS/Linux/WSL)
1. Detect OS and shell.
2. Verify Node.js >= 18 is installed.
   - If missing or too old, print guidance and exit.
   - Optional flag `--install-node` reserved for future automation.
3. Install `@lydia/cli` globally with npm.
4. Ensure global npm bin directory is on PATH.
   - Print instructions if missing.
5. Run `lydia init` (unless `--no-init`).
6. Optionally run `lydia dashboard` (unless `--no-start`).
7. Write a log file to `~/.lydia/install.log`.

### install.ps1 Flow (Windows PowerShell)
1. Detect OS and PowerShell version.
2. Verify Node.js >= 18 is installed.
   - If missing or too old, print guidance and exit.
3. Install `@lydia/cli` globally with npm.
4. Ensure `%AppData%\\npm` (or `npm prefix -g` + `\\bin`) is on PATH.
5. Run `lydia init` (unless `--NoInit`).
6. Optionally run `lydia dashboard` (unless `--NoStart`).
7. Write a log file to `%USERPROFILE%\\.lydia\\install.log`.

### Flags and Options
Common flags (Phase A):
- `--version <semver|tag>`: install a specific CLI version.
- `--no-init`: skip `lydia init`.
- `--no-start`: skip launching dashboard.
- `--registry <url>`: override npm registry.
- `--prefix <path>`: install under a custom npm prefix.

### Security and Trust
- Scripts are served over HTTPS.
- Provide a "download then run" alternative in docs for security-conscious users.
- npm integrity checks provide package verification.

### Uninstall
Document the uninstall steps:
- `npm uninstall -g @lydia/cli`
- Optional: remove `~/.lydia` if you want to wipe local state.

### Integration Points
The installer is a thin wrapper around existing CLI commands:
- `lydia init` for configuration.
- `lydia dashboard` for UI.
- Future: `lydia doctor` for health checks.

## Alternatives Considered
1. Desktop app installer (Tauri/Electron).
2. Native binary + auto-updater.
3. Docker-only distribution.

We chose script + npm for the fastest local-first rollout.

## Risks & Mitigation
- **Node not installed**: clear guidance; optional future auto-install.
- **PATH issues**: detect and guide; show exact path to add.
- **Permission errors**: suggest a user-level npm prefix.
- **Registry availability**: allow `--registry`.

## Testing Plan
- macOS and Ubuntu (fresh machine) with Node 18/20.
- Windows 11 PowerShell with Node 18/20.
- WSL Ubuntu on Windows.
- Verify `lydia init` runs and config is created.
- Verify `lydia dashboard` launches and UI is reachable.
- Uninstall flow cleanly removes CLI.

## Milestones
1. **M1**: Publish design + plan and update docs.
2. **M2**: Add scripts, npm publish pipeline, and basic logs.
3. **M3**: Add optional Node bootstrap and upgrade command.
