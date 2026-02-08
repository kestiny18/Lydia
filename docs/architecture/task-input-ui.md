# Task Input UI (Web)

## Background
To serve non-technical users, Lydia needs a clear, safe way to accept tasks from the web dashboard. This UI should submit a task, show progress, and surface results via TaskReports.

## Goals
- Provide a simple task input form.
- Trigger task execution via API.
- Show immediate status and link to results.
- Preserve safety by blocking high-risk actions that require confirmation (for now).

## Non-Goals
- Real-time streaming execution UI.
- Multi-user session management.
- Advanced conversation UI.

## Data Flow
1. User enters a task.
2. UI posts to `POST /api/tasks/run`.
3. Server runs Agent and returns task result.
4. UI refreshes TaskReports for final output.

## Safety Considerations
The web UI does not yet support interactive confirmations. If a task requires confirmation, the server will auto-deny and return a warning. This is a temporary limitation until interactive confirmation is added.

## API Contract
`POST /api/tasks/run`
Request:
```json
{ "input": "string" }
```
Response:
```json
{
  "task": { "id": "task-...", "status": "completed|failed", "result": "..." },
  "warning": "optional message"
}
```

## UI Design
- Input text area
- Primary "Run Task" button
- Status/Warning message
- Embedded TaskReports list for results

### Structured Prompt Assistant
Add a simple builder to help users describe tasks:
- Goal
- Constraints
- Success Criteria

The builder composes a task prompt and inserts it into the input box.

## Testing Plan
- Manual run with low-risk task.
- Verify TaskReports updates after run.
- Validate warning appears for high-risk tasks.
