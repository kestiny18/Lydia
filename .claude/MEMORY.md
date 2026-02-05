# Lydia Project Memory

## Project Overview

**Name**: Lydia
**Tagline**: AI Agent with Strategic Evolution
**Status**: 🚧 Early Development (v0.1.0)
**Started**: 2026-02-05

## Core Philosophy

Lydia is designed to solve the fundamental challenge of AI agent evolution:
**"How to enable autonomous evolution while maintaining control, safety, and alignment?"**

### Key Innovations

1. **Strategy-Behavior Separation**: Strategies are first-class citizens, explicitly defined and version-controlled
2. **Offline Replay Validation**: Validate strategy updates against historical tasks before deployment
3. **Multi-Branch Evolution**: Parallel exploration with data-driven selection
4. **Update Gate System**: Multi-layer governance (automated + human review)
5. **Execution Binding**: Complete traceability of every decision

## Technical Stack

- **Language**: TypeScript
- **Runtime**: Node.js 20+
- **Package Manager**: pnpm
- **Build Tool**: tsup (esbuild-based)
- **Testing**: vitest
- **Code Quality**: biome
- **CLI Framework**: commander + chalk + ora + enquirer
- **Data Storage**:
  - Strategy configs: YAML files
  - Execution logs: SQLite
  - Cache: In-memory (initially)

## Project Structure

```
lydia/
├── src/
│   ├── core/
│   │   ├── strategy/      # Strategy management
│   │   ├── execution/     # Execution engine with binding
│   │   ├── replay/        # Offline replay validation
│   │   ├── gate/          # Update gate system
│   │   └── skills/        # Skills loader & sandbox
│   ├── cli/               # CLI interface
│   ├── utils/             # Utilities
│   └── types/             # TypeScript type definitions
├── tests/                 # Unit & integration tests
├── docs/                  # Documentation
└── examples/              # Example scenarios
```

## Development Roadmap

### Phase 1: Foundation (Current - Week 1-4)
- [x] Project initialization
- [x] Core configuration files
- [ ] Strategy system (YAML schema, version control)
- [ ] Basic execution engine
- [ ] CLI initialization commands

### Phase 2: Safety & Control (Week 5-8)
- [ ] Update Gate implementation
- [ ] Offline Replay engine
- [ ] Human review interface

### Phase 3: Evolution (Week 9-12)
- [ ] Multi-branch strategy management
- [ ] Automated evaluation
- [ ] Delta generation

### Phase 4: Production Ready (Week 13-16)
- [ ] Web UI dashboard
- [ ] Skills ecosystem
- [ ] Deployment tools

## Design Decisions

### Why TypeScript over Python?
- Better for long-running services (24/7 agent)
- Type safety critical for complex strategy system
- Strong async/event-driven support
- Easier frontend integration (future Web UI)
- While Python is better for ML tasks, Lydia primarily calls LLM APIs

### Why Separate Strategy from Behavior?
Current AI agents (like OpenClaw) mix strategy and behavior in memory files, leading to:
- ❌ Uncontrolled evolution
- ❌ Difficult to audit changes
- ❌ No rollback capability
- ❌ Goal drift over time

Lydia's approach:
- ✅ Strategy as explicit, versioned configuration
- ✅ Every change goes through Update Gate
- ✅ Validation before deployment
- ✅ Full rollback support

### Why Offline Replay?
Testing strategy changes in production = risky

Lydia validates new strategies by:
1. Recording historical task executions
2. Replaying them with candidate strategies
3. Comparing results quantitatively
4. Only deploying if improvement confirmed

## Key Concepts

### Strategy
A versioned configuration defining agent preferences, constraints, and decision-making parameters.

### Execution Binding
Every task execution is bound to a specific strategy version, enabling complete traceability.

### Update Gate
Multi-layer validation system:
1. Automated checks (syntax, conflicts, dependencies)
2. Quality assessment (similarity to existing, test coverage)
3. Safety review (risk scoring, permission audit)
4. Human approval (for high-risk changes)

### Branch
A parallel strategy variant for experimentation without affecting the main strategy.

### Replay
Re-executing historical tasks with a new strategy to validate improvements.

### Delta
Incremental strategy adjustments with controlled magnitude (e.g., max 10% change per update).

## Lessons Learned

### From OpenClaw Analysis
OpenClaw demonstrates powerful capabilities but lacks control mechanisms:
- Self-modification without validation
- Memory pollution vulnerabilities
- Capability explosion (Foundry generates unbounded skills)
- No rollback mechanism
- Goal alignment drift

Lydia addresses these by design.

## Next Actions

1. Implement Strategy Schema (Zod validation)
2. Create Strategy Manager (load/save/version)
3. Build basic CLI (`lydia init`, `lydia strategy show`)
4. Add first example scenario (email filtering demo)

## Team

- **Creator**: [Your name here]
- **AI Assistant**: Claude (Sonnet 4.5)

---

**Last Updated**: 2026-02-05
**Current Focus**: Phase 1 - Strategy System Implementation
