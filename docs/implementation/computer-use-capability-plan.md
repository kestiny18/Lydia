# Computer-Use Capability Implementation Plan

## Objective
Build Lydia computer-use capabilities with a clean architecture:
- No duplicated integration logic.
- MCP for capabilities, Skills for execution guidance.
- Incremental delivery without disrupting the current task-execution chain.

## Principles
1. Single capability path: all executable computer-use actions must enter through ToolDefinition (MCP or DynamicSkill tool), not ad-hoc branches.
2. Clear layering:
   - Capability layer: MCP servers expose stable tool contracts.
   - Strategy layer: Skills provide workflow and policy guidance.
3. Reuse first: prefer shared MCP connection/registration helpers over repeated setup code.
4. Safe-by-default: keep high-risk confirmation and approval memory in the existing gate.

## Current Baseline
- Built-in MCP servers: shell, filesystem, git, memory, interaction.
- Skill system: metadata matching + progressive prompt injection + allowedTools filtering.
- External MCP support: stdio servers configured in `~/.lydia/config.json`.

Recent enabling change:
- Agent MCP bootstrapping has been refactored into reusable connection methods to reduce duplication and prepare capability expansion.

## Phase C0: Foundation (In Progress)
1. Keep MCP connection orchestration centralized in Agent.
2. Introduce declarative built-in server registration for future additions.
3. Preserve existing behavior and tests.

Deliverables:
- No duplicated in-memory MCP connect blocks in Agent init path.
- Core tests pass.

## Phase C1: Browser Capability (MCP-first)
1. Define browser tool contract (navigation, click, type, DOM query, screenshot, download/upload).
2. Add browser MCP server integration via config first (external), then evaluate built-in wrapper if needed.
3. Add a browser-task skill that standardizes reconnaissance -> action -> verification.

Deliverables:
- Browser MCP connected through existing external MCP path.
- One end-to-end browser automation task with verification evidence (text or screenshot path).

## Phase C2: Desktop Capability (MCP-first)
1. Define desktop tool contract (window focus, keyboard input, mouse actions, capture).
2. Integrate a desktop automation MCP server through the same external MCP path.
3. Add safety policy profiles for high-risk desktop actions.

Deliverables:
- Desktop MCP tools visible in ToolDefinition list.
- High-risk desktop actions trigger confirmation flow.

## Phase C3: File and App Operations Hardening
1. Expand file operation primitives (copy/move/search/archive) via MCP tools instead of ad-hoc shell scripts.
2. Add operation verification templates in skills (before/after checks).
3. Add failure taxonomy and recovery hints in task reports.

Deliverables:
- Reduced reliance on opaque shell commands for common file workflows.
- Better report observability for computer-use failures.

## Role Split: Skill vs MCP
- MCP:
  - Adds new executable abilities.
  - Owns stable parameters and runtime semantics.
- Skill:
  - Encodes best-practice workflow and guardrails.
  - Cannot replace missing underlying tool capability.

## Acceptance Criteria
1. Adding one new computer-use domain (browser or desktop) requires:
   - no copy-paste MCP connection logic,
   - no agentic loop changes,
   - only server registration + skill guidance + config wiring.
2. Existing run/chat/task APIs keep behavior compatibility.
3. Risk confirmation remains enforced for high-risk operations.

