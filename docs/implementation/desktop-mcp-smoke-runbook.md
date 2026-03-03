# Desktop MCP Smoke Runbook

## Objective
Validate end-to-end desktop computer-use capability through the standard Lydia path:
config -> MCP discovery -> tool call -> verification evidence.

## Preconditions
1. A desktop MCP server is installed and runnable on your machine.
2. `~/.lydia/config.json` includes a `desktop` MCP server entry.
3. `lydia mcp check --server desktop` succeeds.

## Step 1: Health Check
Preferred single-command smoke:
```bash
lydia computer-use smoke --server desktop
```

Stability run:
```bash
lydia computer-use smoke --server desktop --runs 10 --min-success-rate 0.95
```

Manual health fallback:
```bash
lydia mcp check --server desktop --timeout-ms 15000 --retries 1
```

## Step 2: Tool Discovery Snapshot
```bash
lydia mcp tools --server desktop --json
```

Expected:
1. `ok: true`
2. `toolsByServer[0].tools` contains desktop tools (capture/click/type/key/scroll class actions).

## Step 3: Smoke Task
Run a low-risk desktop task:
```bash
lydia run "Use desktop tools to capture the current screen, identify one visible UI label in text, and report verification evidence."
```

Expected:
1. Task completes.
2. Response includes explicit verification evidence (captured text, frame reference, or artifact path).

## Step 4: High-Risk Confirmation Check
Run a task that triggers potentially destructive desktop actions (for example risky key chords) and verify confirmation behavior.

Expected:
1. Confirmation prompt appears before action.
2. Deny path blocks action.
3. Allow path executes action and records trace/evidence.

## Troubleshooting
1. `MCP server not found in config`: verify `~/.lydia/config.json` key is `desktop`.
2. `Timeout`: increase `--timeout-ms` and verify the MCP process starts independently.
3. Empty tools list: verify server startup logs and exposed tool list.
4. Task cannot use desktop tools: check `allowedTools` restrictions in matched skills.
