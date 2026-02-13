# Browser MCP Smoke Runbook

## Objective
Validate end-to-end browser computer-use capability through the existing Lydia path:
config -> MCP discovery -> tool call -> verification evidence.

## Preconditions
1. A browser MCP server is installed and runnable on your machine.
2. `~/.lydia/config.json` includes a `browser` MCP server entry.
3. Lydia CLI is installed and `lydia mcp check --server browser` succeeds.

## Step 1: Health Check
```bash
lydia mcp check --server browser --timeout-ms 15000 --retries 1
```

Expected:
1. Server status is `ok`.
2. Browser tools are listed (for example: navigate/click/type/screenshot style tools).

## Step 2: Tool Discovery Snapshot
```bash
lydia mcp tools --server browser --json
```

Expected:
1. `ok: true`
2. `toolsByServer[0].tools` is non-empty.

## Step 3: Smoke Task
Run a low-risk task against a public page:
```bash
lydia run "Use browser tools to open https://example.com, capture visible heading text, and report verification evidence."
```

Expected:
1. Task completes.
2. Response includes explicit verification evidence (captured text, selector confirmation, or screenshot/artifact path).

## Step 4: High-Risk Confirmation Check
Run a task that would trigger a potentially destructive action in browser context (if supported by your toolset), and verify user confirmation is requested before execution.

Expected:
1. A confirmation prompt appears.
2. Deny path blocks action.
3. Allow path executes action and records trace.

## Troubleshooting
1. `MCP server not found in config`: check `~/.lydia/config.json` key name and restart.
2. `Timeout`: increase `--timeout-ms` or verify the MCP process can start independently.
3. Empty tools list: verify MCP server is exposing tools and not failing during startup.
4. Task cannot use browser tools: check `lydia mcp tools --server browser` output and ensure no skill `allowedTools` restriction blocks browser tool names.

