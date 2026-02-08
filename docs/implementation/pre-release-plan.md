# Pre-Release Plan (Internal + Alpha)

## Scope
Define a pre-release path to validate Lydia locally before a public release.

## Goals
- Validate install success on clean machines.
- Validate first-run task success with real workflows.
- Capture failure modes and recovery steps before public release.

## Phase P1: Internal Dogfooding (Week 1)
Deliverables:
1. Team installs via one-click scripts.
2. Run at least 10 real tasks end-to-end per person.
3. Record install time, errors, and recovery steps.

Exit Criteria:
- Install success rate >= 90 percent.
- First task success rate >= 80 percent.
- Dashboard opens and shows TaskReports for each run.

## Phase P2: Alpha Pre-Release (Week 2)
Deliverables:
1. Publish a tagged pre-release (alpha) on GitHub.
2. Provide one-click install commands in docs.
3. Collect feedback from 5 to 10 external users.

Exit Criteria:
- Install success rate >= 85 percent across alpha users.
- Major issues are triaged and patched within 48 hours.

## Data to Collect
- Install duration and failures.
- First task success rate.
- Confirmation prompts frequency and clarity.
- Dashboard usability notes.

## Testing Matrix
- macOS Node 18/20
- Windows 11 PowerShell Node 18/20
- Ubuntu Node 18/20
- WSL Ubuntu Node 18/20
