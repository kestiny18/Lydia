# Lydia Documentation Index

## Documentation Structure

### Layer 1: Strategic (Why)
- [Product Vision](./vision.md) - Long-term goals and value proposition
- [Core Philosophy](./philosophy.md) - Design philosophy and principles
- Positioning (planned)

### Layer 2: Tactical (What)
- Product Requirements (PRD) (planned)
- [Technical Roadmap](./roadmap.md) - Phased development plan
- [Architecture Design (ADD)](./architecture/) - System architecture
- [Task Execution Chain](./architecture/task-execution-chain.md) - End-to-end task flow design
- [Task Results Presentation](./architecture/task-results-presentation.md) - User-facing results UI
- [Task Input UI](./architecture/task-input-ui.md) - Web task submission flow
- [Local Installation](./architecture/local-installation.md) - One-click local installer design
- [Safety and Risk Controls](./safety.md)
- [North Star](./north-star.md) - Strategy evolution roadmap
- [Strategy Schema](./strategy-schema.md)

### Layer 3: Execution (How)
- Development Guide (planned)
- API Reference (planned)
- Implementation Details (planned)
- [Task Execution Chain Plan](./implementation/task-execution-chain-plan.md)
- [Local Installation Plan](./implementation/local-installation-plan.md)
- [Pre-Release Plan](./implementation/pre-release-plan.md)
- [Getting Started](./getting-started.md)
- [Release Guide](./release.md)
- [MVP Checklist](./mvp-checklist.md)
- [Demo Script](./demo.md)\r\n- [Strategy Examples](./strategy-examples.md)\r\n
### Layer 4: Reference (Lookup)
- [Decision Records (ADR)](./adr/) - Records of important design decisions
- FAQ (planned)
- Glossary (planned)
- [Changelog](../CHANGELOG.md)

---

## Documentation Guide

### Required Reading Before Dev
1. [Product Vision](./vision.md)
2. [Core Philosophy](./philosophy.md)
3. [Architecture Overview](./architecture/overview.md)

### When Developing New Features
1. Write a design doc first (in `./architecture/` or `./implementation/`)
2. Review the design with the team
3. Update the roadmap
4. Implement
5. Update API docs if public interfaces changed

### When Making Design Decisions
1. Create a new record in `./adr/`
2. Record problem, options, decision, and rationale
3. Keep it for future reference

---

## Documentation Standards

### Document Template
Each design document should include:

```markdown
# Title

## Background
Why is this feature/module needed?

## Goals
What do we want to achieve?

## Non-Goals
Explicitly what we are NOT doing (avoid scope creep)

## Design
How to implement? Includes:
- Architecture diagrams
- Interface definitions
- Data structures
- Flowcharts

## Alternatives
What other options were considered? Why were they rejected?

## Risks & Mitigation
Potential issues and how to handle them?

## Testing Plan
How to verify correctness?

## Milestones
Phased delivery plan
```

### Update Principles
- Design changes must update docs first
- If implementation differs from design, update docs and explain why
- Check documentation consistency before every release

---

## Current Priorities

**Completed**: Core Agent Capabilities
- [x] Product Vision
- [x] Architecture Overview (General + Strategy)
- [x] Technical Roadmap (Weekly detail)
- [x] Agentic Loop — LLM-driven iterative execution
- [x] Streaming Output — Real-time text display
- [x] Multi-turn Chat — Interactive conversation sessions
- [x] Error Recovery — Exponential backoff retry
- [x] Tool Namespace — Collision detection and auto-prefix
- [x] Skill Enhancement — TF-IDF matching, DynamicSkill tool routing
- [x] Dashboard WebSocket — Real-time event push
- [x] Test Coverage — Agent, Skills, MCP, Streaming

**Completed**: Skill System Overhaul (v0.3.0)
- [x] Two-phase progressive loading (metadata-first, lazy content)
- [x] Progressive disclosure in prompt (catalog + active details)
- [x] Hot-reload via fs.watch — skills update without restart
- [x] Community skill compatibility — passthrough schema
- [x] Tags matching in TF-IDF (weight 2.5)
- [x] topK limit for match() — controls prompt token usage
- [x] allowedTools runtime enforcement
- [x] CLI: `lydia skills list/info/install/remove`
- [x] Config: `skills.matchTopK`, `skills.hotReload`, `skills.extraDirs`

**Next**: Production Hardening
- [ ] API Authentication
- [ ] A/B Testing Framework for strategies
- [ ] Reflection Mechanism (post-execution summary)
- [ ] Advanced semantic skill matching (embeddings)

---

**Last Updated**: 2026-02-10
