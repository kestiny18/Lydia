# Local Installation Plan (One-Click Scripts)

## Scope
Deliver a one-command local installer that installs the published CLI, initializes Lydia,
and starts the dashboard for first-time users.

## Phase L1: Release Readiness (Week 1)
Deliverables:
1. Confirm CLI package name and publish target (`@lydia/cli`).
2. Ensure `dist/` is included in the published package.
3. Document supported Node versions (>= 18).

Exit Criteria:
- `npm install -g @lydia/cli` works on a clean machine.
- `lydia --help` runs after install.

## Phase L2: Script Authoring (Week 1)
Deliverables:
1. Implement `install.sh` with Node detection, npm install, and onboarding.
2. Implement `install.ps1` with Node detection, npm install, and onboarding.
3. Add installer flags: `--version`, `--no-init`, `--no-start`, `--registry`, `--prefix`.
4. Write logs to `~/.lydia/install.log`.

Exit Criteria:
- Both scripts install the CLI and run `lydia init`.
- Clear error messages for missing Node, PATH issues, and permissions.

## Phase L3: Hosting and Distribution (Week 2)
Deliverables:
1. Publish scripts to stable URLs (e.g., `install.lydia.ai` or GitHub Releases).
2. Update docs with copy/paste install commands.
3. Add checksum or signature guidance for scripts.

Exit Criteria:
- Users can install via `curl ... | bash` or `irm ... | iex`.
- Docs reflect the new flow.

## Phase L4: Hardening (Week 2)
Deliverables:
1. Add optional `--install-node` (macOS/Linux) using a safe method.
2. Add `lydia doctor` (future) integration for post-install checks.
3. Add uninstall docs and recovery tips.

Exit Criteria:
- Common failure paths have automated fixes or precise guidance.

## Testing Matrix
- macOS (Node 18/20), Ubuntu (Node 18/20), WSL Ubuntu, Windows 11 PowerShell.
- First-time install, reinstall/upgrade, uninstall.
