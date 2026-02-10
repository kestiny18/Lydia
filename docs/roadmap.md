# Lydia Technical Roadmap

## MVP Definition

### Goal
Within 2 weeks, using a **vertical slice** approach, implement a runnable Strategy Engine + CLI prototype.

### MVP Scope

| Included | Excluded (Future Iterations) |
|----------|-----------------------------|
| Yes: Strategy Engine Core (Simplified) | No: Full Branch Management |
| Yes: CLI Client | No: Advanced Web API (Auth/WebSocket) |
| Yes: Basic MCP Integration | No: Advanced Memory (Sync/Vector) |
| Yes: Single LLM Support | No: Multi-Model Switching |
| Yes: Basic Web API (Dashboard) | No: Production-grade API |
| Yes: Local Memory (SQLite) | No: Distributed Memory |

### Success Criteria

```
User inputs task -> Lydia plans steps -> Calls tools to execute -> Returns result
```

Successfully running this complete flow constitutes MVP success.

---

## Phase 1: MVP (2 Weeks)

### Week 1: Core Skeleton

#### Day 1-2: Project Initialization
- [x] Initialize Monorepo structure (pnpm workspace)
- [x] Configure TypeScript, Biome, Vitest
- [x] Create packages/core, packages/cli, packages/shared
- [x] Basic build scripts

#### Day 3-4: LLM Abstraction Layer
- [x] Define LLM Provider Interface
- [x] Implement Anthropic Claude Provider
- [x] Simple conversation call testing

#### Day 5-7: Strategy Engine v0.1
- [x] Define Task, Step, Strategy core types
- [x] Implement Intent Understanding Module (LLM Analysis)
- [x] Implement Task Planning Module (Breakdown into steps)
- [x] Implement Execution Loop (Plan -> Execute -> Observe)

### Week 2: End-to-End Connection

#### Day 8-9: MCP Integration
- [x] Integrate @modelcontextprotocol/sdk
- [x] Implement MCP Client Manager
- [x] Built-in Shell Command MCP Server

#### Day 10-11: CLI Client
- [x] Basic command parsing (lydia run "task description")
- [x] Interactive conversation mode
- [x] Execution process output display

#### Day 12-14: Integration Testing & Fixes
- [ ] End-to-end flow testing
- [ ] Bug fixes and optimization
- [ ] Write basic usage documentation

### MVP Deliverables

```
lydia/
??? packages/
??  ??? core/           # Strategy Engine + LLM + MCP Client
??  ??? cli/            # Command Line Client
??  ??? shared/         # Shared Types
??? docs/               # Documentation
??? README.md           # Quick Start Guide
```

## Gap Analysis (Vision vs. Reality)

### Pillar A: Trusted Agent (Safety & Control)
- Strategy externalization is in progress; still partly code-bound.
- Update gate is minimal; formal 4-layer gate not implemented.
- Replay exists but is manual; no automated scenario testing for proposals.

### Pillar B: Evolutionary Intelligence (Learning)
- Skill system overhauled: progressive loading, hot-reload, community compatibility, CLI management.
- Automated skill generation is still missing.
- Proposal table exists; delta generation and branching are missing.
- Memory is log-heavy; insight/summarization layer is weak.

### Pillar C: Capable Hands (Tools & MCP)
- Core MCP tools exist; ecosystem-specific MCPs are missing.
- Skill installation UX improved: `lydia skills install` supports GitHub and local paths.

### Pillar D: Usability (Deployment & UX)
- CLI works; dashboard is basic.
- No installer/binary yet.

---

## Immediate Focus: Close the Evolution Loop
We will pause on adding new tools and prioritize the closed-loop system.

### Phase 1: Strategy Externalization (Week 1)
Goal: Move strategy from code to data (YAML/JSON).
- Define strategy schema (prompts, parameters, constraints).
- Refactor agent/planner to use loaded strategy.
- Implement strategy versioning in memory.

### Phase 2: The Evaluator (Week 2)
Goal: Lydia must know "How did I do?".
- Implement reviewer module to analyze recent episodes.
- Connect replay manager to strategy overrides.
- Add benchmark episode tagging.

### Phase 3: The Gatekeeper (Week 3)
Goal: Safe evolution.
- Implement 4-layer gate (syntax ?? tests ?? safety ?? human).
- Build CLI/Dashboard review UI for proposals.
---

## Phase 2: Core Refinement (Week 3-4)

### Strategy Engine Enhancement
- [x] Strategy Version Management (Save/Load Strategy Snapshots)
- [x] Strategy Branching Mechanism (Create/Switch Branches)
- [ ] Reflection Mechanism (Post-execution Summary)
- [x] Error Recovery (Retry with exponential backoff)

### Tool Ecosystem
- [x] File System MCP Server
- [x] Git Operation MCP Server
- [x] Support Loading External MCP Servers
- [x] Tool namespace collision handling (auto-prefix)

### Observability
- [x] Execution Log System (traces + episodes)
- [x] Decision Process Visualization (CLI streaming output)

---

## Phase 3: Memory & Learning (Week 5-6)

### Memory System
- [x] Short-term Memory (Session Context via multi-turn chat)
- [x] Long-term Memory (Cross-session Persistence via SQLite)
- [x] Memory Retrieval (Context Recall)

### Replay Validation
- [x] Task Execution History
- [x] Strategy Replay Evaluation
- [ ] A/B Testing Framework

---

## Phase 4: Multi-Platform Support (Week 7-8)

### Web API
- [x] RESTful API Design (Dashboard server)
- [x] WebSocket Real-time Communication
- [ ] API Authentication Mechanism

### Multi-Model Support
- [x] OpenAI GPT-4/4o
- [x] Anthropic Claude (Enhanced, with streaming)
- [x] Local Models (Ollama, with streaming)

### Agent Capabilities (Completed in P0-P2)
- [x] LLM-driven Agentic Loop (replaces plan+execute)
- [x] Streaming output (all providers)
- [x] Multi-turn conversation (chat command + API)
- [x] DynamicSkill tool registration
- [x] TF-IDF skill matching
- [x] Unified ToolDefinition type

### Skill System Overhaul (Completed)
- [x] Two-phase progressive loading (metadata-first, lazy content)
- [x] SkillMeta / StaticSkill type split with passthrough schema
- [x] Tags field support in TF-IDF matching (weight 2.5)
- [x] topK parameter for match() to limit prompt injection
- [x] Progressive disclosure in system prompt (catalog + active details)
- [x] Hot-reload via fs.watch with debounce
- [x] allowedTools runtime enforcement
- [x] CLI: `lydia skills list/info/install/remove`
- [x] Config: `skills.matchTopK`, `skills.hotReload`, `skills.extraDirs`
- [x] Community skill compatibility (.passthrough() schema)

---

## Milestone Summary

| Milestone | Time | Deliverables |
|-----------|------|--------------|
| **M1: MVP** | Week 2 | Runnable CLI + Strategy Engine Prototype |
| **M2: Core Refinement** | Week 4 | Strategy Versioning, Tool Ecosystem |
| **M3: Memory System** | Week 6 | Memory + Replay Validation |
| **M4: Multi-Platform** | Week 8 | Web API + Multi-Model |

---

## Development Principles

### Vertical Slicing
Implement the simplest version of each feature first, run through the complete flow, then iteratively improve.

```
??Wrong: Spend 1 week perfecting LLM layer, then 1 week perfecting Strategy Engine...
??Right: By Week 1, lydia run "hello" works, then iterate and optimize.
```

### Documentation Driven
- Write design docs for new features first.
- Record important decisions in ADRs.
- Update documentation synchronously with code changes.

### Continuous Availability
- Code should be runnable at the end of each day.
- Demonstrable progress every week.

---

**Last Updated**: 2026-02-10


## Immediate Focus: Task Execution Chain
We will prioritize end-to-end task completion reliability before deep evolution work.

### Phase T1: Intent and Context
Goal: Structured intent + task context for every request.
- Extend Intent to IntentProfile (deliverables, constraints, success criteria).
- Build TaskContext from memory + strategy constraints + tool availability.

### Phase T2: Planning and Verification
Goal: Plans must include dependencies and verification.
- Planner outputs dependencies and verification steps.
- Risk tags and confirmation requirements per step.

### Phase T3: Reporting and Feedback
Goal: Produce task reports and capture feedback.
- Reporter generates TaskReport.
- FeedbackCollector stores user feedback.

### Phase T4: Local Installation UX
Goal: One-command local installation for normal users.
- Script installer for macOS/Linux/WSL + Windows PowerShell.
- Publish CLI package with prebuilt dist for npm install.
- Run onboarding automatically after install.

Exit Criteria:
- Each task produces a report and optional feedback record.
- Failures include root cause and recovery hints.
- One-command local install completes without repo setup.

