# Computer-Use Canonical Contract

## Purpose
Provide stable, model-facing action names for browser and desktop computer-use tools, regardless of provider-specific MCP naming differences.

## Runtime Behavior
1. MCP servers can expose any tool names.
2. Lydia normalizes known aliases to canonical names during tool registration.
3. The model can call canonical names; runtime dispatch maps them back to the original MCP tool.

## Browser Canonical Actions
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

## Desktop Canonical Actions
1. `desktop_capture`
2. `desktop_click`
3. `desktop_double_click`
4. `desktop_right_click`
5. `desktop_move_mouse`
6. `desktop_drag`
7. `desktop_type`
8. `desktop_key_press`
9. `desktop_scroll`
10. `desktop_wait_for`

## Notes
1. Canonical aliases are additive: original MCP names remain callable.
2. Collision handling follows existing server-prefix fallback (for example `server-id/browser_click`).
3. This contract standardizes naming only; safety and approval gates remain unchanged in F0/F1.

## Transitional Safety Alignment (F0-F3)
1. F0-F1: risk confirmation remains on the existing agent risk gate (`mustConfirmBefore` and approval memory).
2. F2: canonical dispatch and adapters emit normalized error taxonomy, while safety checks still use existing gate hooks.
3. F3+: safety policy moves into the session-oriented policy engine; canonical naming contract remains stable and unchanged.
4. During transition, any newly introduced high-risk canonical action must be added to existing confirmation policy lists before release.
