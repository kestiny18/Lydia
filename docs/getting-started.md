# Getting Started

This guide helps you initialize Lydia on a new machine.

## Quick Init
```bash
lydia init
```

## Install Script (One-Click)
```bash
curl -fsSL https://github.com/kestiny18/Lydia/releases/latest/download/install.sh | bash
```

```powershell
irm https://github.com/kestiny18/Lydia/releases/latest/download/install.ps1 | iex
```

For local development from source:
```bash
./scripts/install.sh
```

```powershell
.\scripts\install.ps1
```

This creates:
- `~/.lydia/config.json`
- `~/.lydia/strategies/default.yml`
- `~/.lydia/skills/`

## Built-in Skills
Lydia ships with a minimal built-in skill set located at:
`packages/core/skills/`

### Skill Locations (Priority: Project > User > Built-in)

| Level | Path | Scope |
|:------|:-----|:------|
| Built-in | `packages/core/skills/` | All users |
| User Global | `~/.lydia/skills/` | Current user, all projects |
| Project Local | `.lydia/skills/` | Current project only |

### Manage Skills via CLI

```bash
# List all loaded skills
lydia skills list

# Show details and content of a skill
lydia skills info <skill-name>

# Install a skill from GitHub
lydia skills install github:owner/repo/path/to/skill.md

# Install from a local path
lydia skills install ./my-custom-skill/

# Install to project-local skills (instead of user global)
lydia skills install github:owner/repo/path --project

# Remove a user-installed skill
lydia skills remove <skill-name>
```

### Create Your Own Skill

Create a `.md` file with YAML frontmatter:

```yaml
---
name: my-skill
description: A custom skill for my workflow
version: "1.0.0"
tags:
  - custom
  - workflow
allowedTools:
  - shell_execute
  - fs_read_file
---

# My Skill Instructions

1. First, check the current state...
2. Then, perform the action...
```

Place it in `~/.lydia/skills/` (user global) or `.lydia/skills/` (project local).
If hot-reload is enabled (default), the skill will be available immediately without restart.

## Run a Task
```bash
lydia run "check git status"
```

The `run` command executes a single task using the agentic loop. Lydia will stream text output in real-time, call tools as needed, and display the result.

## Interactive Chat
```bash
lydia chat
```

The `chat` command starts a multi-turn conversation session. Conversation history is preserved across messages within the session.

Commands inside chat:
- `/exit` — End the session
- `/reset` — Clear conversation history and start fresh
- `/help` — Show available commands

Options (same as `run`):
- `-m, --model <model>` — Override default model
- `-p, --provider <provider>` — Choose LLM provider

## Choose a Provider
You can set the provider in `~/.lydia/config.json`:
```json
{
  "llm": {
    "provider": "auto",
    "defaultModel": "",
    "fallbackOrder": ["ollama", "openai", "anthropic"]
  }
}
```

Use `mock` for offline testing:
```bash
lydia run --provider mock "test task"
```

To use OpenAI:
```bash
export OPENAI_API_KEY="..."
lydia run --provider openai "test task"
```

To use Ollama:
```bash
export OLLAMA_BASE_URL="http://localhost:11434/api"
export OLLAMA_DEFAULT_MODEL="llama3"
lydia run --provider ollama "test task"
```

## Configuration

The full configuration schema (`~/.lydia/config.json`):

```json
{
  "llm": {
    "provider": "auto",
    "defaultModel": "",
    "fallbackOrder": ["ollama", "openai", "anthropic"]
  },
  "mcpServers": {},
  "strategy": {
    "activePath": "",
    "approvalCooldownDays": 7,
    "approvalDailyLimit": 1,
    "replayEpisodes": 10
  },
  "safety": {
    "userDataDirs": [],
    "systemDirs": [],
    "allowPaths": [],
    "denyPaths": [],
    "rememberApprovals": true
  },
  "agent": {
    "maxIterations": 50,
    "intentAnalysis": false,
    "maxRetries": 3,
    "retryDelayMs": 1000,
    "streaming": true
  },
  "skills": {
    "matchTopK": 3,
    "hotReload": true,
    "extraDirs": []
  }
}
```

### Agent Options

| Option | Default | Description |
|--------|---------|-------------|
| `maxIterations` | 50 | Max agentic loop iterations per task (safety valve) |
| `intentAnalysis` | false | Enable LLM intent analysis before execution |
| `maxRetries` | 3 | Max retry attempts for failed LLM calls |
| `retryDelayMs` | 1000 | Base delay for exponential backoff (1s, 2s, 4s...) |
| `streaming` | true | Use streaming output (set false to use non-streaming fallback) |

### Skill Options

| Option | Default | Description |
|--------|---------|-------------|
| `matchTopK` | 3 | Max number of skills whose full content is injected into prompts |
| `hotReload` | true | Enable file system watching for automatic skill reload |
| `extraDirs` | [] | Additional directories to scan for skills |

### External MCP Example: Browser Automation

Lydia can use browser computer-use tools through an external MCP server:

```json
{
  "mcpServers": {
    "browser": {
      "command": "npx",
      "args": ["-y", "@your-org/mcp-browser-server"]
    }
  }
}
```

After startup, browser tools from that server are available to the agent through the normal tool-calling path.

## Launch Dashboard
```bash
lydia dashboard
```

The dashboard provides a web UI for running tasks, viewing reports, and managing strategies. When connected, it uses **WebSocket** for real-time agent event streaming (text output, tool progress, etc.), with automatic fallback to HTTP polling if WebSocket is unavailable.
