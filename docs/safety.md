# Safety and Risk Controls

This document describes how Lydia enforces safety controls during execution, and how you can configure them.

## Goals
- Default allow, but prompt on high-risk actions.
- Make approvals durable and auditable.
- Keep controls simple and local-first.

## Risk Model
Lydia evaluates each tool call before execution.

High-risk actions include:
- Destructive shell commands targeting protected paths.
- File writes inside protected paths.
- External MCP tool calls that are not classified as low-risk computer-use reads.
- High-risk computer-use actions (for example upload/drag or risky desktop key chords).

Lower-risk computer-use reads (for example `browser_screenshot`, `browser_extract_text`, `desktop_capture`) can proceed without confirmation when no other risk rules are triggered.

When a tool call is high risk, Lydia will ask for confirmation. Approvals can be temporary (task-only) or persistent.

## Approval Memory
Approvals are stored in SQLite as facts with the `risk_approval` tag. This enables:
- Persistent approvals across tasks.
- Auditability via the dashboard.

The prompt supports:
- `yes` for task-only approval
- `always` for persistent approval

You can disable approval memory in config:

```json
{
  "safety": {
    "rememberApprovals": false
  }
}
```

## Approval Revocation (API-only)
You can revoke approvals without a dashboard UI:
- Delete by id: `DELETE /api/memory/approvals/:id`
- Delete by signature: `DELETE /api/memory/approvals?signature=...`

Signatures are recorded in approval tags as `signature:<value>`.

## API Authentication

Lydia server supports optional API token authentication.

When `server.apiToken` (or env `LYDIA_API_TOKEN`) is set:
1. All non-public `/api/*` routes require either:
   - `Authorization: Bearer <token>`, or
   - `x-lydia-session: <session-id>` from `POST /api/auth/session`.
2. Public routes remain accessible for setup and health:
   - `/api/status`
   - `/api/setup/*`
   - `/api/auth/session`

Example config:
```json
{
  "server": {
    "apiToken": "replace-with-strong-token",
    "sessionTtlHours": 24
  }
}
```

## Protected Paths
Lydia treats the following as protected by default:

User data (default):
- `~/.lydia`
- `~/Desktop`
- `~/Documents`
- `~/Downloads`

Windows system paths (default):
- `C:\\Windows`
- `C:\\Program Files`
- `C:\\Program Files (x86)`
- `C:\\ProgramData`

### Allow and Deny Overrides
You can override safety with allow/deny lists:

```json
{
  "safety": {
    "allowPaths": ["C:\\\\safe-zone"],
    "denyPaths": ["C:\\\\Windows\\\\System32"]
  }
}
```

Rules:
- `denyPaths` always takes precedence over `allowPaths`.
- Both lists are path-prefix matches.

## Notes
- These are minimal guardrails for local-first use.
- Future work may add finer-grained command classification and user roles.
