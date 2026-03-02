# ADR-007: Adopt Session-Oriented Computer-Use Fusion Architecture

## Status
Accepted - 2026-03-01
Approved by: Lydia maintainers
Effective scope: `packages/core/src/computer-use/*`, replay/evaluation integration, dashboard evidence rendering

## Context
Lydia currently supports computer-use through MCP tools and skill guidance, but runtime behavior is still partially fragmented across generic tool execution, adapter aliasing, replay traces, and dashboard rendering.

This increases long-term risk:
1. Domain features can drift into one-off integrations.
2. Multimodal evidence is not consistently modeled as first-class runtime data.
3. Replay/evaluation logic can diverge from real runtime behavior.

## Decision
Adopt a session-oriented computer-use fusion architecture with:
1. canonical action registry as model-facing control surface,
2. capability adapters as execution translation layer,
3. observation frames as first-class evidence,
4. checkpoint/evaluation extensions tied to the same session model.

## Consequences
### Positive
1. Browser and desktop follow one architecture path.
2. Safety, replay, and promotion logic align on shared runtime data.
3. Dashboard/CLI observability can rely on stable evidence schema.

### Negative
1. Requires phased migration across runtime, storage, evaluation, and UI.
2. Short-term feature velocity may slow while contracts stabilize.

## Alternatives Considered
1. Continue incremental MCP integrations.
   Rejected: leads to adapter drift and inconsistent observability.
2. Build a new separate computer-use runtime service.
   Rejected: unnecessary system split at current scale; increases complexity.

## References
1. `docs/architecture/computer-use-fusion-architecture.md`
2. `docs/implementation/computer-use-fusion-rollout-plan.md`
3. `docs/architecture/computer-use-canonical-contract.md`
