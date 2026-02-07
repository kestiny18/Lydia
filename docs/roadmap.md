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
├── packages/
�?  ├── core/           # Strategy Engine + LLM + MCP Client
�?  ├── cli/            # Command Line Client
�?  └── shared/         # Shared Types
├── docs/               # Documentation
└── README.md           # Quick Start Guide
```

---

## Phase 2: Core Refinement (Week 3-4)

### Strategy Engine Enhancement
- [ ] Strategy Version Management (Save/Load Strategy Snapshots)
- [ ] Strategy Branching Mechanism (Create/Switch Branches)
- [ ] Reflection Mechanism (Post-execution Summary)
- [ ] Error Recovery (Retry/Alternative Solutions)

### Tool Ecosystem
- [ ] File System MCP Server
- [ ] Git Operation MCP Server
- [ ] Support Loading External MCP Servers

### Observability
- [ ] Execution Log System
- [ ] Decision Process Visualization (CLI Output)

---

## Phase 3: Memory & Learning (Week 5-6)

### Memory System
- [ ] Short-term Memory (Session Context)
- [ ] Long-term Memory (Cross-session Persistence)
- [ ] Memory Retrieval (Context Recall)

### Replay Validation
- [ ] Task Execution History
- [ ] Strategy Replay Evaluation
- [ ] A/B Testing Framework

---

## Phase 4: Multi-Platform Support (Week 7-8)

### Web API
- [ ] RESTful API Design (production)
- [ ] WebSocket Real-time Communication
- [ ] API Authentication Mechanism

### Multi-Model Support
- [ ] OpenAI GPT-4/4o
- [ ] Anthropic Claude (Enhanced)
- [ ] Local Models (Ollama)

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
�?Wrong: Spend 1 week perfecting LLM layer, then 1 week perfecting Strategy Engine...
�?Right: By Week 1, lydia run "hello" works, then iterate and optimize.
```

### Documentation Driven
- Write design docs for new features first.
- Record important decisions in ADRs.
- Update documentation synchronously with code changes.

### Continuous Availability
- Code should be runnable at the end of each day.
- Demonstrable progress every week.

---

**Last Updated**: 2026-02-07
