# Lydia

> The first personal AI assistant designed for capability and control.
>
> Let your agent learn from experience, but never lose control.

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![Status](https://img.shields.io/badge/Status-Prototype-orange.svg)](https://github.com/kestiny18/Lydia)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
<!-- ALL-CONTRIBUTORS-BADGE:START - Do not remove or modify this section -->
[![All Contributors](https://img.shields.io/badge/all_contributors-3-orange.svg?style=flat-square)](#contributors-)
<!-- ALL-CONTRIBUTORS-BADGE:END -->

---

## The Problem: AI Agents Drift

Many agents improve over time, but their behavior can drift:

- They skip confirmations to save time.
- They take broader actions than you intended.
- They become hard to audit, hard to roll back, and hard to trust.

---

## The Solution: Controlled Evolution

Lydia is a local-first assistant that treats strategy evolution as a first-class concern.

### Core Ideas

1. Strategy-behavior separation
- The agent's operating policy is stored as a versioned strategy file, not hidden in code.

2. Safety gates for updates
- Candidate strategy changes are checked for syntax, risk, replay performance, and human review.

3. Branch-based exploration
- Lydia can create experimental branches, validate them, and only merge what passes.

---

## Quick Start

### Option A: One-Click Scripts (Internal Alpha)

These scripts install the CLI (via npm), run `lydia init`, and optionally start the dashboard.

- macOS/Linux/WSL:
  - `curl -fsSL https://raw.githubusercontent.com/kestiny18/Lydia/main/scripts/install.sh | bash`
- Windows PowerShell:
  - `irm https://raw.githubusercontent.com/kestiny18/Lydia/main/scripts/install.ps1 | iex`

Notes:
- Requires Node.js 18+.
- If `@lydia/cli` is not yet published, the scripts fall back to building/installing from source (slower).

### Option B: From Source (Recommended for Now)

```bash
# Clone the repo
git clone https://github.com/kestiny18/Lydia.git
cd Lydia

# Install dependencies
pnpm install

# Build
pnpm build

# Initialize local state
pnpm tsx packages/cli/src/index.ts init
```

Run your first task:
```bash
pnpm tsx packages/cli/src/index.ts run "check git status"
```

Start an interactive chat session:
```bash
pnpm tsx packages/cli/src/index.ts chat
```

Launch the dashboard (with real-time WebSocket):
```bash
pnpm tsx packages/cli/src/index.ts dashboard
```

Manage skills:
```bash
# List all loaded skills
pnpm tsx packages/cli/src/index.ts skills list

# Install a community skill from GitHub
pnpm tsx packages/cli/src/index.ts skills install github:user/repo/path/to/skill.md

# Show skill details
pnpm tsx packages/cli/src/index.ts skills info git-commit

# Remove an installed skill
pnpm tsx packages/cli/src/index.ts skills remove my-skill
```

---

## How Lydia Works

At runtime, Lydia uses an **LLM-driven agentic loop**:

1. **Understand** — Analyze user intent and retrieve relevant skills/memories.
2. **Think** — LLM reasons about the task, decides what to do next.
3. **Act** — If a tool is needed, execute it via MCP and feed the result back.
4. **Repeat** — The LLM continues until the task is complete (`end_turn`).
5. **Report** — Aggregate results, collect feedback for future improvement.

This loop supports **streaming output** for real-time text display, **multi-turn conversations** for interactive sessions, and **automatic retry with exponential backoff** for resilience.

---

## Key Capabilities

| Capability | Description |
|------------|-------------|
| **Agentic Loop** | LLM-driven iterative execution: think → tool_use → observe → repeat |
| **Streaming Output** | Real-time text and thinking display via `generateStream` |
| **Multi-turn Chat** | `lydia chat` — interactive REPL with persistent conversation context |
| **Multi-provider LLM** | Anthropic, OpenAI, Ollama with auto-fallback |
| **MCP Tools** | Shell, FileSystem, Git, Memory, and external MCP servers |
| **Skill System** | Progressive disclosure, hot-reload, community-compatible skills with TF-IDF matching |
| **Skill CLI** | `lydia skills list/info/install/remove` — manage and install skills from GitHub |
| **Controlled Evolution** | Strategy versioning, proposals, replay evaluation, human review |
| **Dashboard** | Web UI with WebSocket real-time event streaming |
| **Error Recovery** | Exponential backoff retry for LLM calls, tool errors fed back to LLM |

---

## Controlled Evolution Flow

Strategy updates are treated as proposals and are validated before they can be applied:

```text
Agent proposes update
  -> Gate 1: Syntax and integrity
  -> Gate 2: Evolution limits and safety checks
  -> Gate 3: Offline replay and evaluation
  -> Gate 4: Human review when required
Approved or rejected
```

---

## Architecture (Under the Hood)

```text
+-----------------------------------------+
|           Agentic Loop (Agent)          |  <- LLM-driven iterative execution
+-----------------+-----------------------+
                  |
        +---------+---------+
        |                   |
+-------v-------+   +------v--------+
| LLM Providers |   | MCP Tool Mgr  |  <- Streaming + Function Calling
| (Stream/Gen)  |   | + Skill Tools |
+-------+-------+   +------+--------+
        |                   |
+-------v-------------------v---------+
|     Memory / Strategy / Skills      |  <- Context and knowledge
+-----------+-------------------------+
            |
+-----------v-------------------------+
|   CLI / Dashboard / Server API      |  <- User interfaces
|   (Chat REPL, WebSocket, REST)      |
+-----------------------------------------+
```

- Full architecture: `docs/architecture/overview.md`
- Task execution chain: `docs/architecture/task-execution-chain.md`
- Safety and risk controls: `docs/safety.md`

---

## Documentation

Start here:
- `docs/README.md`
- `docs/getting-started.md`
- `docs/roadmap.md`
- `docs/north-star.md`

---

## Contributing

PRs are welcome. See `CONTRIBUTING.md`.

---

## Why "Lydia"?

Named after the ancient kingdom of Lydia, which introduced coined money: a standardized, trustworthy medium of exchange.

Just as Lydia brought trust to trade, this project aims to bring trust to agent behavior and evolution.

---

## Contributors

Thanks to the people who have contributed to this project.

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tr>
    <td align="center"><a href="https://github.com/kestiny18"><img src="https://github.com/kestiny18.png?size=100" width="50px;" style="border-radius: 50%;" alt="kestiny" /><br /><sub><b>kestiny</b></sub></a></td>
    <td align="center"><a href="https://github.com/openai"><img src="https://github.com/openai.png?size=100" width="50px;" style="border-radius: 50%;" alt="codex" /><br /><sub><b>codex</b></sub></a></td>
    <td align="center"><a href="https://github.com/claude"><img src="https://github.com/claude.png?size=100" width="50px;" style="border-radius: 50%;" alt="claude" /><br /><sub><b>claude</b></sub></a></td>
  </tr>
</table>
<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->
<!-- ALL-CONTRIBUTORS-LIST:END -->

## License

MIT License - see [LICENSE](LICENSE) for details.
