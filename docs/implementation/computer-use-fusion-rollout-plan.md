# Computer-Use Fusion Rollout Plan

## Objective
Execute computer-use as a full architecture migration, not incremental glue patches.

## Execution Policy
1. Design-first gate: no new domain feature without contract/update docs.
2. Phase gate: each phase has explicit exit criteria and test evidence.
3. Backward compatibility: existing task/chat APIs remain stable during migration.

## Phase F0: Contract Freeze
### Scope
1. Lock canonical actions and action envelope schema.
2. Lock observation frame schema and checkpoint extension schema.
3. Define error taxonomy and risk policy mapping table.

### Exit Criteria
1. Architecture docs approved.
2. ADR approved.
3. Contract test skeleton merged.
4. Contract tests pass at 100% for `action/observation/checkpoint/error-taxonomy` baseline cases.

## Phase F1: Session Orchestrator Foundation
### Scope
1. Introduce `ComputerUseSessionOrchestrator` in core runtime.
2. Add lifecycle events: start/action/frame/checkpoint/end.
3. Add no-op adapter path for current MCP tools (compatibility shim).

### Exit Criteria
1. Existing tasks still pass.
2. Session lifecycle events emitted and test-covered.
3. Lifecycle completeness >= 99% across 100 forced-run integration samples (`start -> action -> frame -> checkpoint -> end`).

## Phase F2: Canonical Action Dispatch
### Scope
1. Dispatch canonical action -> adapter -> MCP tool call.
2. Normalize tool errors to stable taxonomy codes.
3. Add adapter contract tests for browser domain.

### Exit Criteria
1. Browser canonical actions runnable via configured MCP.
2. Alias map and dispatch behavior test-covered.
3. Browser canonical smoke success rate >= 95% across 50 runs.
4. 100% adapter failures are mapped to a stable taxonomy code.

## Phase F3: Evidence and Checkpoint Upgrade
### Scope
1. Persist observation frames (text/image/artifact refs).
2. Extend checkpoint payload with evidence refs.
3. Resume flow restores latest evidence context.

### Exit Criteria
1. Interrupted session resume with evidence continuity.
2. No regression in existing task checkpoint tests.
3. Resume success rate >= 95% across 40 interruption injection tests.
4. Checkpoint round-trip preserves `latestFrameIds` with 0 missing references.

## Phase F4: Replay and Evaluation Upgrade
### Scope
1. Replay consumes observation frames, not just text traces.
2. Evaluator gains multimodal-aware signals.
3. Promotion checks use updated evaluation fields.

### Exit Criteria
1. Replay deterministic on canonical actions + frame references.
2. New evaluator metrics exposed in status/report APIs.
3. Deterministic replay consistency >= 99/100 repeated runs on fixed input/action traces.
4. Multimodal evaluation fields covered by API contract tests and replay snapshots.

Validation command example:
`lydia replay <episodeId> --runs 100 --min-consistency 0.99`

## Phase F5: Dashboard and Ops Tooling
### Scope
1. Evidence-first task views (text + screenshots + artifacts).
2. Session timeline for computer-use runs.
3. Ops commands for session inspection and replay debug.

### Exit Criteria
1. Dashboard can inspect evidence timeline end-to-end.
2. CLI can inspect session and replay details.
3. Evidence timeline renders `text + screenshot + artifact` blocks for 100% sampled sessions.
4. Ops smoke tests pass for session inspect + replay debug commands (20/20).

## Test Strategy
1. Contract tests: action/observation/checkpoint schemas.
2. Runtime tests: orchestrator lifecycle and adapter dispatch.
3. Integration tests: browser smoke run under canonical actions.
4. Regression tests: existing core/cli/dashboard suites remain green.

## Decision Gates
1. F0 -> F1: architecture approval.
2. F2 -> F3: adapter reliability approval.
3. F3 -> F4: evidence durability approval.
4. F4 -> F5: evaluator correctness approval.
5. Every gate requires: documented evidence, passing tests, and metric thresholds met for the current phase.

## Deliverable Mapping
1. Architecture: `docs/architecture/computer-use-fusion-architecture.md`
2. Contracts: `packages/core/src/computer-use/*`
3. Existing capability plan remains tactical:
   `docs/implementation/computer-use-capability-plan.md`
