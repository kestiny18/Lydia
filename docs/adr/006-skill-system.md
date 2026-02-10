# ADR-006: Introduce Skill System as Knowledge Injection Layer

## Status

**Decided** - 2025-02-06

## Context

In ADR-005, we decided to adopt MCP as the tool execution protocol. However, after deeper research into Claude Code's implementation, we found our previous understanding of the relationship between Skills and MCP needed correction:

### Previous Misconception

> "Claude Code's Skills are just MCP under the hood."

### Reality

- **Skill**: Markdown + YAML config, for **knowledge/instruction injection**.
- **MCP**: JSON-RPC protocol, for **tool/capability extension**.

They are **complementary**, not inclusive.

### Problem

The current architecture only plans for MCP as "hands and feet," lacking a lightweight "experience/knowledge" injection mechanism. This leads to:

1. Strategy engine needing hardcoded logic for various scenarios.
2. Difficulty for users to customize Lydia's behavior patterns.
3. Inability to reuse Skill assets from the Claude Code community.

## Decision

**Introduce Skill System as Lydia's knowledge injection layer, existing in parallel with the MCP tool execution layer.**

## Positioning of Skill vs. MCP

```
┌─────────────────────────────────────────────────────────────┐
│                        Strategy Engine                      │
│       (Intent → Planning → Decision → Reflection)           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       Capability Layer                      │
│  ┌─────────────────────────┐  ┌─────────────────────────┐  │
│  │      Skill System       │  │      MCP Client         │  │
│  │   (Knowledge Injection) │  │    (Tool Execution)     │  │
│  │                         │  │                         │  │
│  │  - Behavior Guide       │  │  - File Ops             │  │
│  │  - Best Practices       │  │  - Shell Cmds           │  │
│  │  - Process Templates    │  │  - API Calls            │  │
│  │  - Domain Knowledge     │  │  - External Svcs        │  │
│  └─────────────────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

| Dimension | Skill | MCP |
|:----------|:------|:----|
| **Essence** | Config + Docs | Service Protocol |
| **Role** | Tells Lydia **HOW** | Gives Lydia **ABILITY** |
| **Complexity** | Low (Parse Markdown) | Medium (JSON-RPC) |
| **Runtime Cost** | Near Zero | Maintain Connection |
| **Customization** | Simple (Write Markdown) | Complex (Implement Server) |

## Skill System Design

### File Structure

```
my-skill/
├── SKILL.md           # Main file (Required)
├── templates/         # Optional templates
├── examples/          # Optional examples
└── scripts/           # Optional helper scripts
```

### SKILL.md Format

```yaml
---
name: code-review
description: Used when performing code reviews, provides structured review process and best practices
allowed-tools: Read, Grep, Bash(git diff *)
context: fork          # Optional: execute in sub-agent
---

When performing a code review, follow this process:

1. **Understand Scope of Change**
   - View list of modified files
   - Understand purpose of change

2. **Check Code Quality**
   - Clear naming?
   - Correct logic?
   - Potential bugs?

3. **Security Review**
   - Sensitive info leakage?
   - Injection vulnerabilities?

4. **Output Format**
   Use the following template for review results:
   ...
```

### Skill Locations

| Level | Path | Scope |
|:------|:-----|:------|
| Built-in | `packages/core/skills/` | All users |
| User | `~/.lydia/skills/` | Current user, all projects |
| Project | `.lydia/skills/` | Current project only |

Priority: Project > User > Built-in

### Core Functions

#### 1. Automatic Invocation

Strategy engine decides whether to load a skill based on `description`:

```typescript
// Pseudo-code
const relevantSkills = skillRegistry.match(userIntent);
if (relevantSkills.length > 0) {
  context.inject(relevantSkills[0].content);
}
```

#### 2. Manual Invocation

User explicitly triggers via `/skill-name`:

```bash
lydia> /code-review src/auth/
```

#### 3. Tool Restrictions

Limit tools available during skill execution via `allowed-tools`:

```yaml
allowed-tools: Read, Grep, Bash(git *)
```

#### 4. Dynamic Context (Phase 2)

Support executing commands and injecting results when skill loads:

```markdown
Current branch status:
`!git status --short`
```

## Implementation Plan

### Phase 1: Basic Framework -- COMPLETED

```
packages/core/src/skills/
├── types.ts          # SkillMeta / StaticSkill / DynamicSkill types + type guards
├── parser.ts         # SKILL.md parser (parse + parseMeta)
├── loader.ts         # Two-phase loader (metadata-first + lazy content)
├── registry.ts       # Skill registry with TF-IDF matching + topK + tags
├── watcher.ts        # File system watcher for hot-reload
├── self-evolution.ts  # DynamicSkill: strategy self-evolution
└── index.ts          # Export
```

Core Interface (as implemented):

```typescript
// Lightweight metadata (Phase 1 — always in memory)
interface SkillMeta {
  name: string;
  description: string;
  version?: string;
  author?: string;
  tags?: string[];
  allowedTools?: string[];
  context?: 'main' | 'fork';
  path?: string;
  [key: string]: unknown; // passthrough for community fields
}

// Full skill with content (Phase 2 — loaded on demand)
interface StaticSkill extends SkillMeta {
  content: string;
}

interface SkillRegistry {
  register(skill: Skill | SkillMeta): void;
  unregister(name: string): boolean;
  get(name: string): Skill | SkillMeta | undefined;
  match(intent: string, topK?: number): (Skill | SkillMeta)[];
  list(): (Skill | SkillMeta)[];
}
```

### Phase 2: Strategy Engine Integration -- COMPLETED

- Agent queries relevant skills during intent analysis via TF-IDF.
- Progressive prompt injection: Layer 1 (catalog) + Layer 2 (active details).
- `allowedTools` runtime enforcement implemented (soft filtering).
- Skills config: `matchTopK`, `hotReload`, `extraDirs`.

### Phase 3: CLI Integration -- COMPLETED

- `lydia skills list` — list all loaded skills.
- `lydia skills info <name>` — show skill details and content.
- `lydia skills install <source>` — install from GitHub or local path.
- `lydia skills remove <name>` — remove installed skills.

### Phase 4: Advanced Features (Future)

- Dynamic context injection (`!command` syntax).
- Skill argument passing (`$ARGUMENTS`).
- Skill composition and inheritance.
- Advanced semantic matching (embeddings).

## Planned Built-in Skills

Initial batch:

| Skill | Description |
|:------|:------------|
| `code-review` | Structured code review |
| `git-commit` | Standardized Git commit |
| `debug` | Systematic debugging process |
| `explain-code` | Code explanation (with diagrams) |
| `refactor` | Refactoring best practices |

## Consequences

### Positive

- **Lightweight Extension**: Users can extend Lydia behavior by writing Markdown.
- **Strategy Reuse**: Best practices can be packaged and shared.
- **Decoupling**: Decouples strategy logic from code to config.
- **Progressive Enhancement**: Does not affect existing MCP architecture.

### Negative

- **Maintenance**: Adds a new subsystem to maintain.
- **Integration**: Needs careful design of skill/strategy engine integration points.

### Mitigation

- Keep Skill system simple; core only does parsing and injection.
- Loose coupling with MCP system; can evolve independently.

## Amendment to ADR-005

Suggest adding clarification to ADR-005:

> MCP is responsible for tool execution (Lydia's "Hands/Feet"), Skill is responsible for knowledge injection (Lydia's "Experience"). Together they form Lydia's Capability Layer.

## References

- [Claude Code Skills Docs](https://docs.anthropic.com/en/docs/claude-code/skills)
- [Agent Skills Open Standard](https://agentskills.io)
- ADR-005: MCP Protocol Decision

---

**Deciders**: Project Lead
**Consulted**: Claude (AI Assistant)
