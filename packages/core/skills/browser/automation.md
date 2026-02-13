---
name: browser-automation-workflow
description: Execute browser tasks safely with a reconnaissance-first workflow and explicit verification.
version: "1.0.0"
tags:
  - browser
  - automation
  - testing
---

# Browser Automation Workflow

Use this workflow when a task requires browser interaction (navigation, form filling, verification, screenshot, download checks).

## Principles
1. Reconnaissance first: inspect page state before acting.
2. Small steps: one meaningful action at a time.
3. Verification after each action: do not assume success.
4. Capture evidence: include key outputs (text assertions, screenshot paths, or artifacts).

## Recommended Sequence
1. Identify available browser tools and confirm target URL.
2. Navigate to target and wait for the page/app to stabilize.
3. Discover selectors from rendered content before clicking/typing.
4. Execute minimal actions required for the task.
5. Verify outcome with explicit checks (text visible, element state, URL change, artifact exists).
6. Return concise evidence and next risks.

## Guardrails
- Do not run destructive actions (bulk delete, account changes, irreversible submissions) without user confirmation.
- Avoid blind retries; if selector/action fails, re-inspect the page and adapt.
- If authentication or MFA blocks progress, report the exact blocker and request user input.

