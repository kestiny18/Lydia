# Lydia Architecture Overview

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────�?�?                       User Access Layer                        �?�? ┌─────────────�? ┌─────────────�? ┌─────────────�?             �?�? �? CLI Client �? �?  Web API   �? �? SDK Integ. �?             �?�? └──────┬──────�? └──────┬──────�? └──────┬──────�?             �?└─────────┼────────────────┼────────────────┼─────────────────────�?          �?               �?               �?          �?               �?               �?┌─────────────────────────────────────────────────────────────────�?�?                       Core Engine Layer                        �?�? ┌─────────────────────────────────────────────────────────�?   �?�? �?                   Agent Runtime                        �?   �?�? �? ┌───────────�? ┌───────────�? ┌───────────�?           �?   �?�? �? �?Task Mgr  �? �?Session Mgr�? �?Context Mgr�?           �?   �?�? �? └───────────�? └───────────�? └───────────�?           �?   �?�? └─────────────────────────────────────────────────────────�?   �?�?                             �?                                 �?�?                             �?                                 �?�? ┌─────────────────────────────────────────────────────────�?   �?�? �?                Strategy Engine (Core)                  �?   �?�? �? ┌───────────�? ┌───────────�? ┌───────────�?           �?   �?�? �? �?Intent    �? �?Planner   �? �?Decision  �?           �?   �?�? �? └───────────�? └───────────�? └───────────�?           �?   �?�? �? ┌───────────�? ┌───────────�? ┌───────────�?           �?   �?�? �? �?Evaluator �? �?Reflection�? �?Recovery  �?           �?   �?�? �? └───────────�? └───────────�? └───────────�?           �?   �?�? └─────────────────────────────────────────────────────────�?   �?└─────────────────────────────────────────────────────────────────�?                               �?                               �?┌─────────────────────────────────────────────────────────────────�?�?                       Capability Layer                         �?�? ┌───────────────────────────────────────────────────────────�? �?�? �?                 Capability Abstraction                   �? �?�? �? ┌─────────────────────────�? ┌─────────────────────────�?�? �?�? �? �?     Skill System       �? �?     MCP Tools          �?�? �?�? �? �?  (Knowledge Injection) �? �?   (Tool Execution)     �?�? �?�? �? └─────────────────────────�? └─────────────────────────�?�? �?�? └───────────────────────────────────────────────────────────�? �?�? ┌───────────�? ┌───────────�? ┌───────────�?                   �?�? �?LLM Abstr.�? �?Memory Sys�? �?Knowledge �?                   �?�? └───────────�? └───────────�? └───────────�?                   �?└─────────────────────────────────────────────────────────────────�?                               �?                               �?┌─────────────────────────────────────────────────────────────────�?�?                    Infrastructure Layer                        �?�? ┌───────────�? ┌───────────�? ┌───────────�? ┌───────────�?   �?�? �?Storage   �? �?Logging   �? �?Config    �? �?Plugins   �?   �?�? └───────────�? └───────────�? └───────────�? └───────────�?   �?└─────────────────────────────────────────────────────────────────�?```

---

## Technology Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **Language** | TypeScript | Type safety, rich ecosystem, unified frontend/backend |
| **Runtime** | Node.js | Mature, stable, async-friendly, cross-platform |
| **CLI Framework** | Commander + Inquirer | Lightweight, flexible, interactive |
| **Web Framework** | Hono | Lightweight, fast, TypeScript friendly |
| **LLM Integration** | Custom Abstraction | Support multi-model switching, unified interface |
| **Tool Execution** | MCP (Model Context Protocol) | Industry standard, rich ecosystem |
| **Knowledge** | Skill System | Lightweight config, user extensible |
| **Storage** | JSON + SQLite | Local-first, lightweight, no external deps |
| **Testing** | Vitest | Fast, native TypeScript support |

---

## Four-Layer Architecture Detail

### Layer 1: User Access Layer

Responsible for user interaction, providing multiple access methods:

| Access Method | Description | Priority |
|---------------|-------------|----------|
| **CLI** | Command line interaction, developer's choice | P0 |
| **Web API** | RESTful + WebSocket, remote access | P1 |
| **SDK** | Embedded in other apps as a library | P2 |

### Layer 2: Core Engine Layer

The brain of the system, containing two core components:

#### Agent Runtime
- **Task Manager**: Manages task lifecycle (create �?execute �?complete/fail)
- **Session Manager**: Maintains conversation context and history
- **Context Manager**: Manages current execution environment and state

#### Strategy Engine (The Core)
- **Intent Understanding**: Analyzes user input to identify real needs
- **Task Planning**: Decomposes complex tasks into executable steps
- **Execution Decision**: Selects optimal execution paths and tools
- **Strategy Evaluation**: Assesses the effectiveness of current strategies
- **Reflection Mechanism**: Summarizes lessons learned after execution
- **Error Recovery**: Handles failures and attempts alternative solutions

### Layer 3: Capability Layer

Provides specific execution capabilities:

| Module | Responsibility |
|--------|----------------|
| **LLM Abstraction** | Unified interface for calling different LLMs |
| **Tool System** | Manages and calls external tools/APIs |
| **Memory System** | Short-term + Long-term memory management |
| **Knowledge Base** | Stores and retrieves domain knowledge |

### Layer 4: Infrastructure Layer

Underlying support services:

| Module | Responsibility |
|--------|----------------|
| **File Storage** | Local data persistence |
| **Logging System** | Records execution process, supports debugging |
| **Config Management** | Manages system and user configurations |
| **Plugin System** | Supports third-party extensions |

---

## Data Flow

### Typical Request Processing Flow

```
User Input
    �?    �?┌─────────────────�?�?1. Access Layer  �?�?Parse command/request
└────────┬────────�?         �?         �?┌─────────────────�?�?2. Intent Analysis�?�?Call LLM to analyze intent
└────────┬────────�?         �?         �?┌─────────────────�?�?3. Task Planning  �?�?Break down into subtasks
└────────┬────────�?         �?         �?┌─────────────────�?�?4. Exec Decision  �?�?Select tools and strategy
└────────┬────────�?         �?         �?┌─────────────────────────────────────�?�?5. Execution Loop                    �?�?   ┌──────────────────────────────�?�?�?   �?Execute Step �?Observe �?Eval �?�?�?   �?    �?                  �?   �?�?�?   �?    └───────────────────�?   �?�?�?   └──────────────────────────────�?�?└────────┬────────────────────────────�?         �?         �?┌─────────────────�?�?6. Result Aggreg. �?�?Summarize results
└────────┬────────�?         �?         �?┌─────────────────�?�?7. Reflection     �?�?Record experience
└────────┬────────�?         �?         �?    Return to User
```

---

## Directory Structure

```
lydia/
├── docs/                    # Documentation
├── packages/                # Core Packages (Monorepo)
�?  ├── core/               # Core Engine
�?  �?  ├── src/
�?  �?  �?  ├── agent/      # Agent Runtime
�?  �?  �?  ├── strategy/   # Strategy Engine
�?  �?  �?  ├── llm/        # LLM Abstraction
�?  �?  �?  ├── tools/      # Tool System
�?  �?  �?  ├── memory/     # Memory System
�?  �?  �?  └── utils/      # Utilities
�?  �?  └── package.json
�?  ├── cli/                # CLI Client
�?  �?  ├── src/
�?  �?  └── package.json
�?  ├── server/             # Web Service
�?  �?  ├── src/
�?  �?  └── package.json
�?  └── shared/             # Shared Types & Tools
�?      ├── src/
�?      └── package.json
├── plugins/                 # Official Plugins
├── examples/                # Example Code
├── tests/                   # Integration Tests
├── scripts/                 # Build Scripts
├── package.json             # Root Config
├── pnpm-workspace.yaml      # Monorepo Config
└── tsconfig.json            # TypeScript Config
```

---

## Key Design Decisions

### ADR-001: Adopt Monorepo Structure

**Decision**: Use pnpm workspace to manage multiple packages.

**Reasoning**:
- Core, CLI, Server can be published independently.
- Shared code is easy to reuse.
- Unified version management.

### ADR-002: Strategy Engine Independent of LLM

**Decision**: Separate strategy logic from LLM calls.

**Reasoning**:
- Easier to test (can mock LLM).
- Supports switching different LLMs.
- Strategy logic can be optimized independently.

### ADR-003: Local-First Storage

**Decision**: Default to local file storage.

**Reasoning**:
- Zero-config startup.
- Controllable data privacy.
- Offline availability.

---

## Evolution Loop (Closed-Loop Learning)

The evolution engine should follow a strict, reviewable cycle:
1. Observe: Analyze episodes and traces for patterns.
2. Propose: Generate a strategy update or new skill.
3. Validate: Offline replay against benchmark episodes.
4. Gate: Syntax �� Tests �� Safety �� Human approval.
5. Merge: Apply with cooldown and version tracking.

This loop is the missing link between logs/replay and safe autonomy.

---
## Next Steps

Detailed design documents:
- [Module Design](./modules.md) - Detailed design of each module
- [Data Model](./data-model.md) - Core data structures
- [API Design](./api.md) - External interface definition

---

**Last Updated**: 2026-02-07

- [Task Execution Chain](./task-execution-chain.md) - End-to-end task flow design
