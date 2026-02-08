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

## Mainline B: Task Execution Excellence

Goal: Make Lydia reliably complete user tasks end-to-end with clear outputs and feedback.

### Phase B1: Intent and Context
Exit Criteria:
- IntentProfile includes deliverables, constraints, success criteria.
- TaskContext assembled for each run (memory + tools + strategy).

### Phase B2: Planning and Verification
Exit Criteria:
- Plans include dependencies, risk tags, and verification steps.
- Execution enforces confirmations for high-risk steps.

### Phase B3: Reporting and Feedback
Exit Criteria:
- TaskReport generated for each task.
- Feedback captured and stored for learning.

## Executive Summary
Status: **On the Right Path**

We have successfully built the **skeleton** of Lydia: Strategy-first architecture, independent memory/trace logging, and risk/gate abstractions. These are aligned with the Controlled Evolution vision.

The **brain** (Evolution Loop) is still disconnected. We have the components (logs, replay manager, proposal table), but not the closed loop that enables safe, autonomous improvement.

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

Status: In progress (proposal table + basic gate rules exist)

### Phase A3: Offline Replay Validation
Goal: Validate strategy changes before adoption.

Exit Criteria:
- Replay engine can evaluate a candidate strategy on recent tasks.
- Comparative results are recorded and surfaced.

Status: In progress (replay infrastructure exists, strategy replay partially wired)

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
- Strategy externalization is in progress, not yet fully data-bound.
- Replay is present but not yet fully integrated into proposal validation.

## Critical Missing Link: The Evolution Loop
We need a closed loop that connects observation to safe strategy updates:

1. **Observe**: Analyze recent episodes for failures or inefficiencies.
2. **Propose**: Generate a strategy update or new skill.
3. **Validate**: Offline replay against benchmark episodes.
4. **Gate**: Multi-layer validation (syntax → tests → safety → human).
5. **Merge**: Apply the change with cooldown and version tracking.

## Working Agreement
After each stage, we update this document and compare reality to the expected outcomes.
