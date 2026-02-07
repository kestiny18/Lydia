# Lydia North Star

This document keeps the long-term direction aligned and tracks progress against the core strategy-evolution roadmap.

## Product Expectation (Summary)
- A personal AI assistant that helps its human partner succeed.
- Model-agnostic: supports vendor APIs and local LLMs.
- Capable of operating the computer with human-level tooling.
- Evolves in a controlled and reviewable way.
- Extensible via MCP, Skills, and future tools.
- Easy to deploy and easy to use.

## Mainline A: Controlled Evolution (Primary Roadmap)

### Phase A1: Strategy Externalization (Foundations)
Goal: Make strategy explicit, versioned, and auditable.

Exit Criteria:
- Strategy schema (YAML/JSON) defined and validated.
- Current behavior bound to a named strategy version.
- Strategy file stored locally with version history.

Status: In progress (schema + binding in code)

### Phase A2: Update Gate (Safety Review)
Goal: Prevent unsafe or low-quality strategy changes.

Exit Criteria:
- Gate pipeline with at least two stages:
  - Automatic validation
  - Human approval for high-risk changes
- Strategy update proposals recorded with decision logs.

Status: Not started

### Phase A3: Offline Replay Validation
Goal: Validate strategy changes before adoption.

Exit Criteria:
- Replay engine can evaluate a candidate strategy on recent tasks.
- Comparative results are recorded and surfaced.

Status: In progress (replay infrastructure exists, strategy replay not wired)

### Phase A4: Strategy Branching
Goal: Explore multiple strategies safely and select the best.

Exit Criteria:
- Ability to create, archive, and compare strategy branches.
- Candidate branches evaluated via replay before merge.

Status: Not started

### Phase A5: Delta Evolution + Cooldown
Goal: Ensure incremental, controlled improvements.

Exit Criteria:
- Strategy deltas are bounded (max change).
- Cooldown period enforced between merges.
- Human review required for high-impact deltas.

Status: Not started

## Current State Summary
- Safety approvals, risk controls, and memory replay exist.
- Strategy is still implicit (needs externalization).
- Replay is present but not tied to strategy versions.

## Working Agreement
After each stage, we update this document and compare reality to the expected outcomes.
