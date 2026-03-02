# Computer-Use Architecture Fusion

## Background
Lydia already has a strong agentic loop, MCP integration, strategy governance, and replay/evaluation foundations.  
Current computer-use capabilities are usable, but still assembled from separate pieces (external MCP + skill guidance + generic traces), not yet a unified runtime architecture.

The next step is not adding more tools. The next step is aligning the architecture so browser/desktop/file operations share one coherent execution model.

## Goals
1. Build a single computer-use runtime model that covers browser and desktop.
2. Keep one execution path: strategy -> canonical action -> capability adapter -> observation -> evaluation.
3. Treat multimodal observations (text + image + artifacts) as first-class runtime data.
4. Keep safety and governance integrated with existing risk gate and strategy evolution.
5. Make replay/evaluation deterministic enough for strategy promotion decisions.

## Non-Goals
1. Replacing MCP with a proprietary protocol.
2. Shipping every domain adapter at once.
3. Building cloud orchestration before local architecture stabilizes.

## Core Principles
1. Capability/Policy separation: adapter executes, strategy decides.
2. Canonical action semantics: model sees stable action names independent of provider-specific tool names.
3. Observation-first loop: every action must produce structured evidence.
4. Sessionized execution: computer-use runs in an explicit session lifecycle.
5. Governance continuity: shadow/canary/promotion rules stay in one control plane.

## Target Architecture

```text
User/API
  -> Task Runtime (existing)
    -> Computer-Use Session Orchestrator (new)
      -> Canonical Action Registry (existing seed, expanded)
      -> Capability Adapter Layer (MCP servers)
      -> Observation Bus (text/image/artifact events)
      -> Safety Policy Engine (risk + confirmation + approvals)
      -> Checkpoint/Evidence Store (memory + artifact metadata)
      -> Evaluator/Promotion Inputs (existing replay/shadow extended)
```

## Module Responsibilities

### 1) Computer-Use Session Orchestrator
Orchestrates one session lifecycle:
1. `session.start`
2. `action.dispatch`
3. `observation.collect`
4. `verification`
5. `checkpoint.save`
6. `session.end`

This avoids ad-hoc tool chaining and gives one place for retries/timeouts/recovery.

### 2) Canonical Action Registry
Defines domain actions and aliases:
1. Browser canonical actions
2. Desktop canonical actions
3. Domain-agnostic metadata (`requiredArgs`, risk hints, verification hints)

The registry is model-facing and versioned.

### 3) Capability Adapter Layer
Adapters translate canonical actions to actual MCP tools:
1. Alias mapping
2. Argument normalization
3. Capability discovery
4. Error normalization (stable error taxonomy)

### 4) Observation Bus
All tool outcomes become observation events:
1. `text`
2. `image`
3. `artifact_ref`
4. `structured_json`

Observation events are retained for:
1. next-turn reasoning
2. audit/report UI
3. replay/evaluation

### 5) Safety Policy Engine
Risk is enforced at action-level granularity:
1. domain risk defaults
2. action risk overrides
3. environment/path/domain policy checks
4. confirmation memory reuse

### 6) Checkpoint & Evidence Store
Session checkpoints must include:
1. pending action context
2. latest observation frame refs
3. verification status
4. replay metadata

## Canonical Runtime Data Contracts

### Action Envelope
```ts
type ComputerUseActionEnvelope = {
  sessionId: string;
  actionId: string;
  domain: 'browser' | 'desktop';
  canonicalAction: string;
  args: Record<string, unknown>;
  riskLevel: 'low' | 'medium' | 'high';
  requestedAt: number;
};
```

### Observation Frame
```ts
type ObservationFrame = {
  sessionId: string;
  actionId: string;
  frameId: string;
  blocks: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; mediaType: string; dataRef: string }
    | { type: 'artifact_ref'; kind: 'download' | 'upload' | 'log'; path: string }
    | { type: 'structured_json'; payload: Record<string, unknown> }
  >;
  createdAt: number;
};
```

### Session Checkpoint
```ts
type ComputerUseCheckpoint = {
  sessionId: string;
  taskId: string;
  lastActionId?: string;
  latestFrameIds: string[];
  verificationFailures: number;
  updatedAt: number;
};
```

### Error Taxonomy (F0 Lock)
```ts
type ComputerUseErrorCode =
  | 'ARG_INVALID'
  | 'CAPABILITY_UNAVAILABLE'
  | 'POLICY_DENIED'
  | 'EXECUTION_FAILED'
  | 'OBSERVATION_MISSING';
```

1. `ARG_INVALID`: canonical action args fail schema or adapter validation.
2. `CAPABILITY_UNAVAILABLE`: required MCP capability or adapter is not available.
3. `POLICY_DENIED`: safety policy blocks action execution.
4. `EXECUTION_FAILED`: tool call executed but failed at provider/runtime level.
5. `OBSERVATION_MISSING`: action finished without required observation evidence.

## Fusion with Existing Lydia Systems
1. Agentic loop remains unchanged as the outer loop.
2. MCP remains capability transport.
3. Strategy/shadow/promotion remains governance control plane.
4. Replay/evaluator consumes richer observations.
5. Dashboard gains evidence-first rendering without changing task APIs.

## Migration Strategy
1. Phase F0: Architecture freeze and contract lock.
2. Phase F1: Session orchestrator skeleton and event schema.
3. Phase F2: Adapter normalization + canonical registry v1.
4. Phase F3: Evidence storage and checkpoint upgrade.
5. Phase F4: Replay/evaluator upgrade for multimodal evidence.
6. Phase F5: Dashboard evidence views and operator tooling.

No phase proceeds until prior phase acceptance criteria are met.

## Acceptance Criteria
1. No new domain capability bypasses canonical action registry.
2. Every computer-use action produces at least one observation frame.
3. Checkpoint resume restores both task state and evidence context.
4. Shadow/canary evaluations can compare multimodal outcomes.
5. UI can render at least text + screenshot evidence for any run.

## Risks and Mitigation
1. Risk: Too many one-off adapters.
   Mitigation: Adapter interface + contract tests required for each adapter.
2. Risk: Image payload bloat.
   Mitigation: artifact references for storage, bounded inline payload size.
3. Risk: Governance drift between action domains.
   Mitigation: shared policy engine with domain-specific overlays only.
