# Task Results Presentation (UI)

## Background
Lydia must present task outcomes clearly to non-technical users. The execution chain now produces TaskReports, but the UI still needs a user-friendly results surface that summarizes success, outputs, and next steps.

## Goals
- Show task outcomes in a human-readable format.
- Make successes, failures, and follow-ups obvious.
- Surface step-level progress when available.
- Reuse existing TaskReport data from MemoryManager.

## Non-Goals
- Replacing the CLI output.
- Real-time streaming of step execution.
- Full task authoring UI (handled separately).

## Data Source
The UI reads `task_reports` via `/api/reports`:
- Stored by `TaskReporter` in Core.
- Report JSON can evolve without schema migrations.

## UI Design
### Layout
- List of recent reports with status badges.
- Expandable details panel per report.
- Summary section: intent summary + overall success.
- Outputs section: captured outputs (file paths, text).
- Steps section: step status list (if available).
- Follow-ups: next actions when task failed or incomplete.

### States
- Loading
- Empty (no reports)
- Error
- Normal

## Integration Points
- Dashboard: `TaskReports` component (reports tab)
- API: `/api/reports` in CLI server
- Core: TaskReport shape extended to include `steps`

## Risks
- Reports may lack step data (legacy data). UI must handle missing fields gracefully.

## Testing Plan
- Unit test for reporter output already present.
- Manual UI check in dashboard to ensure legacy reports render safely.

