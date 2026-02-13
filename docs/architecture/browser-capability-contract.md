# Browser Capability Contract

## Background
Lydia will consume browser computer-use abilities through MCP tools. To keep architecture clean, browser integration must not add custom execution branches in Agent.

## Goals
- Define a stable browser tool contract for MCP servers.
- Keep integration path unchanged: ToolDefinition -> agentic loop -> risk gate -> tool call.
- Ensure skills can guide workflow without replacing underlying capability tools.

## Non-Goals
- Binding to one specific browser MCP implementation.
- Shipping a built-in browser server in this phase.

## Contract Design
Browser capabilities should be exposed as explicit tools with JSON schemas. Names can be prefixed by server id on collision.

Recommended baseline tool set:
1. `browser_navigate`
2. `browser_click`
3. `browser_type`
4. `browser_select`
5. `browser_wait_for`
6. `browser_extract_text`
7. `browser_screenshot`
8. `browser_download`
9. `browser_upload`
10. `browser_close`

## Minimum Input/Output Requirements
1. Inputs must be schema-defined and deterministic (URL, selector, timeout, value, path).
2. Output must be text-serializable for model feedback in the agentic loop.
3. Errors must return actionable reasons (selector not found, timeout, navigation blocked).

## Error Taxonomy (Recommended)
Use stable machine-friendly codes in error text or payload:
1. `BROWSER_TIMEOUT`: navigation/wait timed out.
2. `ELEMENT_NOT_FOUND`: selector or role target not found.
3. `ELEMENT_NOT_INTERACTABLE`: element exists but cannot be clicked/typed.
4. `NAVIGATION_BLOCKED`: auth, CSP, popup, or policy blocked navigation.
5. `DOWNLOAD_FAILED`: expected download did not complete.
6. `UPLOAD_FAILED`: upload input failed or file inaccessible.
7. `SESSION_CLOSED`: browser/page/context already closed.
8. `UNKNOWN`: uncategorized error (include original message).

## Safety Integration
1. External MCP tools are high risk by default and require confirmation.
2. Risk signatures should be stable enough for approval memory reuse.
3. Destructive browser actions should include explicit user confirmation in skill workflow.

## Skill Layer Usage
Skills should provide:
1. Reconnaissance-first sequencing.
2. Verification after each critical action.
3. Evidence reporting (assertions, screenshot path, downloaded artifact path).

Skills should not:
1. Pretend to provide browser capability without an actual tool.
2. Bypass risk confirmation semantics.

## Integration Checklist
1. Add browser MCP server in `~/.lydia/config.json`.
2. Confirm tools are visible in agent tool definitions.
3. Execute a low-risk smoke task (navigate + read text).
4. Execute a high-risk action and verify confirmation flow.

## Acceptance Criteria
1. Browser MCP tools work through existing agentic loop without special-case code.
2. Tool names are visible in system prompt for model discoverability.
3. Task output includes verification evidence.
