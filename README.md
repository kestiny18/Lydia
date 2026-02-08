# Lydia

> **Your Personal AI Assistant with Built-in Safety Evolution**
>
> Let your agent learn from experience, but never lose control.

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![Status](https://img.shields.io/badge/Status-Prototype-orange.svg)](https://github.com/kestiny18/Lydia)
<!-- ALL-CONTRIBUTORS-BADGE:START - Do not remove or modify this section -->
[![All Contributors](https://img.shields.io/badge/all_contributors-3-orange.svg?style=flat-square)](#contributors-)
<!-- ALL-CONTRIBUTORS-BADGE:END -->


---

## The Problem: AI Assistants That Evolve... Into Chaos

Imagine this scenario:

**Week 1**: Your personal assistant learns to respond faster.
**Week 3**: It starts skipping confirmations to "save time".
**Week 5**: It's sending emails or modifying code without your permission.
**Week 7**: You check the logs and realize: **It evolved beyond your control.**

Most current AI agents are either rigid tools (don't learn) or black boxes (learn unpredictably).

---

## The Solution: Lydia

**Lydia** is a personal AI assistant designed to be **capable yet controllable**. It treats **strategy evolution as a first-class citizen**, ensuring that as it learns to serve you better, it never violates your safety boundaries.

### Core Capabilities

- **Strategic Planning**: Breaks down complex requests into executed steps.
- **Task Execution Chain**: Structured intent, verified plans, execution reports, and feedback loop.
- **Full Toolset**: Built-in support for Shell, FileSystem, Git, and extensible via MCP.
- **Skill System**: Teach Lydia new capabilities via simple Markdown files.
- **Safety Gates**: Validates strategy updates before they are applied.
- **Risk Controls**: High-risk actions require confirmation with optional persistent approvals.

---

## See It In Action

> *Placeholder for Demo GIF: Showing Lydia accepting a task, checking memory, asking for confirmation, and executing it.*

![Lydia Demo](docs/demo.gif)

---

## Quick Start (5 Minutes)

### Install
Planned: One-click local installer scripts for macOS/Linux/Windows.
See [docs/architecture/local-installation.md](docs/architecture/local-installation.md) and
[docs/implementation/local-installation-plan.md](docs/implementation/local-installation-plan.md).

```bash
# Clone the repo
git clone https://github.com/kestiny18/Lydia.git
cd Lydia

# Install dependencies
pnpm install

# Build
pnpm build
```
\r\n### Initialize\r\n```bash\r\npnpm tsx packages/cli/src/index.ts init\r\n```\r\n
### Run Your Assistant
```bash
# Example: Git status checker
pnpm tsx packages/cli/src/index.ts run "check git status"
```

### Teach Lydia a New Skill
Simply drop a markdown file into `~/.lydia/skills/`:

```markdown
# My Custom Workflow

This skill helps me deploy to staging.

## Steps
1. Run tests
2. Build docker image
...
```
Lydia automatically learns this on the next run!

---

## Lydia vs. The Rest

| Feature | LangChain / CrewAI | AutoGPT | **Lydia** |
|---------|--------------------|---------|-----------|
| **Focus** | Dev Framework | Autonomous Demo | **Personal Product** |
| **Control** | Low (Prompt-based) | None | **High (Strategy-based)** |
| **Safety** | Manual Guardrails | "YOLO" | **Built-in Gates** |
| **Extensibility**| Python Code | Plugins | **Markdown Skills & MCP** |

---

## Use Cases

### 1. **Coding Companion**
"Lydia, refactor this component and run tests. Don't commit unless tests pass."

### 2. **System Management**
"Clean up old docker containers and update system packages."

### 3. **Personal Automation**
"Sort my downloads folder and organize receipts by date."

---

## Architecture (Under the Hood)

```
©°©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©´
©¦           Intent Analyzer              ©¦  ¡û Understands your goal
©¸©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©Ð©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¼
                ¡ý
©°©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©´
©¦         Strategic Planner              ©¦  ¡û Generates a safe plan
©¦  (loads your Skills & Preferences)     ©¦
©¸©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©Ð©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¼
                ¡ý
©°©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©´
©¦          Execution Engine              ©¦  ¡û Do the work
©¦   (Shell, FileSystem, Git, Custom...)  ©¦
©¸©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©Ð©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¼
```

**Full Architecture**: [docs/architecture/overview.md](docs/architecture/overview.md)
**Task Execution Chain**: [docs/architecture/task-execution-chain.md](docs/architecture/task-execution-chain.md)
**Safety and Risk Controls**: [docs/safety.md](docs/safety.md)

---

## Roadmap and Progress\r\n\r\nThis README is the product entry point. Detailed progress tracking lives in:\r\n- [docs/north-star.md](docs/north-star.md) (strategic evolution roadmap)\r\n- [docs/roadmap.md](docs/roadmap.md) (engineering roadmap)\r\n\r\n## MVP Release\r\n\r\n- Release and installer notes: [docs/release.md](docs/release.md)\r\n- MVP checklist and success criteria: [docs/mvp-checklist.md](docs/mvp-checklist.md)\r\n- Demo script: [docs/demo.md](docs/demo.md)\r\n\r\n---

## Why "Lydia"?

Named after the ancient kingdom of Lydia, which invented **coined money**¡ªthe first standardized, trustworthy medium of exchange.

Just as Lydia brought **trust** to trade, we want to bring **trust** to your AI assistant.

---

## Contributors

Thanks to the people who have contributed to this project.

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tr>
    <td align="center"><a href="https://github.com/kestiny18"><img src="https://github.com/kestiny18.png?size=100" width="100px;" alt="kestiny" /><br /><sub><b>kestiny</b></sub></a><br /><a href="https://github.com/kestiny18" title="Code">:computer:</a></td>
    <td align="center"><a href="https://github.com/openai"><img src="https://github.com/openai.png?size=100" width="100px;" alt="codex" /><br /><sub><b>codex</b></sub></a><br /><a href="https://github.com/openai" title="Code">:computer:</a></td>
    <td align="center"><a href="https://github.com/claude"><img src="https://github.com/claude.png?size=100" width="100px;" alt="claude" /><br /><sub><b>claude</b></sub></a><br /><a href="https://github.com/claude" title="Code">:computer:</a></td>
  </tr>
</table>
<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->
<!-- ALL-CONTRIBUTORS-LIST:END -->

## License

MIT License - see [LICENSE](LICENSE) for details.

---

<div align="center">

**Built with care by** [kestiny18](https://github.com/kestiny18)**

*Your Trustworthy AI Assistant*

</div>




