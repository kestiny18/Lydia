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
- [Safety and Risk Controls](./safety.md)
- [North Star](./north-star.md) - Strategy evolution roadmap
- [Strategy Schema](./strategy-schema.md)

### Layer 3: Execution (How)
- Development Guide (planned)
- API Reference (planned)
- Implementation Details (planned)
- [Task Execution Chain Plan](./implementation/task-execution-chain-plan.md)
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

**Phase 1 (This Month)**: Basic Documentation
- [x] Product Vision
- [x] Architecture Overview (General + Strategy)
- [x] Technical Roadmap (Weekly detail)
- [ ] Setup task tracking

**Phase 2 (Next Month)**: Core Feature Development
- Implement the strategy system according to design docs
- Continuously update API docs

---

**Last Updated**: 2026-02-08
