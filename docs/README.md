# Lydia Documentation Index

## 📚 Documentation Structure

### Layer 1: Strategic (Why)
- [Product Vision](./vision.md) - Long-term goals and value proposition
- [Core Philosophy](./philosophy.md) - Design philosophy and principles
- Positioning (planned)

### Layer 2: Tactical (What)
- Product Requirements (PRD) (planned)
- [Technical Roadmap](./roadmap.md) - Phased development plan
- [Architecture Design (ADD)](./architecture/) - System architecture
  - [Overview](./architecture/overview.md)
  - Module Design (planned)
  - Data Model (planned)
  - API Design (planned)
- [Safety and Risk Controls](./safety.md)

### Layer 3: Execution (How)
- Development Guide (planned)
- API Reference (planned)
- Implementation Details (planned)

### Layer 4: Reference (Lookup)
- [Decision Records (ADR)](./adr/) - Records of important design decisions
- FAQ (planned)
- Glossary (planned)
- Changelog (planned)

---

## 🎯 Documentation Guide

### Required Reading Before Dev
1. [Product Vision](./vision.md) - Understand direction
2. [Core Philosophy](./philosophy.md) - Understand principles
3. [Architecture Overview](./architecture/overview.md) - Understand structure

### When Developing New Features
1. Write design doc first (in `./architecture/` or `./implementation/`)
2. Review design (discuss with team)
3. Update Roadmap (adjust priority)
4. Start coding
5. Update API docs (if public interface changed)

### When Making Design Decisions
1. Create new record in `./adr/`
2. Record problem, options, decision, and rationale
3. Keep for future reference

---

## 📖 Documentation Standards

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
- ✅ Design changes must update docs first
- ✅ If implementation differs from design, update docs and explain why
- ✅ Check documentation consistency before every release

---

## 🚀 Current Priorities

**Phase 1 (This Month)**: Basic Documentation
- [x] Product Vision
- [x] Architecture Overview (General + Strategy)
- [x] Technical Roadmap (Weekly detail)
- [ ] Setup task tracking

**Phase 2 (Next Month)**: Core Feature Development
- Implement strategy system according to design docs
- Continuously update API docs

---

**Last Updated**: 2026-02-05
