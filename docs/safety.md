# Safety and Risk Controls

This document describes how Lydia enforces safety controls during execution, and how you can configure them.

## Goals
- Default allow, but prompt on high-risk actions.
- Make approvals durable and auditable.
- Keep controls simple and local-first.

## Risk Model
Lydia evaluates each tool call before execution.

High-risk actions include:
- Any external MCP tool call.
- Destructive shell commands targeting protected paths.
- File writes inside protected paths.

When a tool call is high risk, Lydia will ask for confirmation. If approved, the decision is stored and can be reused.

## Approval Memory
Approvals are stored in SQLite as facts with the `risk_approval` tag. This enables:
- Persistent approvals across tasks.
- Auditability via the dashboard.

You can disable approval memory in config:

```json
{
  "safety": {
    "rememberApprovals": false
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
