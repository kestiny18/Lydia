# Lydia

> **Your Personal AI Assistant with Built-in Safety Evolution**
>
> Let your agent learn from experience, but never lose control.

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![Status](https://img.shields.io/badge/Status-Prototype-orange.svg)](https://github.com/kestiny18/Lydia)

---

## ⚠️ The Problem: AI Assistants That Evolve... Into Chaos

Imagine this scenario:

**Week 1**: Your personal assistant learns to respond faster ✅
**Week 3**: It starts skipping confirmations to "save time" ⚠️
**Week 5**: It's sending emails or modifying code without your permission ❌
**Week 7**: You check the logs and realize: **It evolved beyond your control.** ❌❌❌

Most current AI agents are either rigid tools (don't learn) or black boxes (learn unpredictably).

---

## ✅ The Solution: Lydia

**Lydia** is a personal AI assistant designed to be **capable yet controllable**. It treats **strategy evolution as a first-class citizen**, ensuring that as it learns to serve you better, it never violates your safety boundaries.

### Core Capabilities

- 🧠 **Strategic Planning**: Breaks down complex requests into executed steps.
- 🛠️ **Full Toolset**: Built-in support for Shell, FileSystem, Git, and extensible via MCP.
- 📚 **Skill System**: Teach Lydia new capabilities via simple Markdown files.
- 🛡️ **Safety Gates**: (Coming Soon) Validates strategy updates before they are applied.

---

## 🚀 Quick Start (5 Minutes)

### Install
```bash
# Clone the repo
git clone https://github.com/kestiny18/Lydia.git
cd Lydia

# Install dependencies
pnpm install

# Build
pnpm build
```

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

## 📊 Lydia vs. The Rest

| Feature | LangChain / CrewAI | AutoGPT | **Lydia** |
|---------|--------------------|---------|-----------|
| **Focus** | Dev Framework | Autonomous Demo | **Personal Product** |
| **Control** | Low (Prompt-based) | None | **High (Strategy-based)** |
| **Safety** | Manual Guardrails | "YOLO" | **Built-in Gates** |
| **Extensibility**| Python Code | Plugins | **Markdown Skills & MCP** |

---

## 🎯 Use Cases

### 1. **Coding Companion**
"Lydia, refactor this component and run tests. Don't commit unless tests pass."

### 2. **System Management**
"Clean up old docker containers and update system packages."

### 3. **Personal Automation**
"Sort my downloads folder and organize receipts by date."

---

## 🏗️ Architecture (Under the Hood)

```
┌─────────────────────────────────────────┐
│           Intent Analyzer              │  ← Understands your goal
└───────────────┬─────────────────────────┘
                ↓
┌─────────────────────────────────────────┐
│         Strategic Planner              │  ← Generates a safe plan
│  (loads your Skills & Preferences)     │
└───────────────┬─────────────────────────┘
                ↓
┌─────────────────────────────────────────┐
│          Execution Engine              │  ← Do the work
│   (Shell, FileSystem, Git, Custom...)  │
└───────────────┬─────────────────────────┘
```

**Full Architecture**: [docs/architecture.md](docs/architecture.md)

---

## 🛣️ Roadmap

### ✅ Phase 1-3: Foundation (Complete)
- Core Engine (Intent, Planner, Execution)
- Tool Integration (Shell, FS, Git, MCP)
- Skill System (Markdown-based knowledge)
- CLI Interface

### ✅ Phase 4: Intelligence & Safety (Completed)
- [x] **Long-term Memory**: Remembering your preferences and past tasks (SQLite)
- [x] **Human-in-the-Loop**: Interactive confirmation for risky actions
- [x] **Offline Replay**: Validating new strategies against past success

### 📅 Phase 5: Production Ready (Next)
- [ ] Web Dashboard
- [ ] Pre-built Skill Library
- [ ] One-click Installer

---

## 🌟 Why "Lydia"?

Named after the ancient kingdom of Lydia, which invented **coined money**—the first standardized, trustworthy medium of exchange.

Just as Lydia brought **trust** to trade, we want to bring **trust** to your AI assistant.

---

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

<div align="center">

**Built with ❤️ by [kestiny18](https://github.com/kestiny18)**

*Your Trustworthy AI Assistant*

</div>
