# Getting Started

This guide helps you initialize Lydia on a new machine.

## Quick Init
```bash
lydia init
```

## Install Script (Optional)
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

## Run a Task
```bash
lydia run "check git status"
```

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

## Launch Dashboard
```bash
lydia dashboard
```
