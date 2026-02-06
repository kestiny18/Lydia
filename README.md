# Lydia

> AI Agent with Strategic Evolution

Lydia is a next-generation AI agent framework that enables **controlled, safe, and auditable** autonomous evolution through strategic branching, replay validation, and multi-layer governance.

## 🌟 Core Philosophy

Unlike traditional AI agents that evolve unpredictably, Lydia separates **strategy from behavior**, allowing agents to:

- ✅ **Evolve Safely**: Multi-branch exploration with validation gates
- ✅ **Stay Aligned**: Strategy updates require approval and verification
- ✅ **Remain Auditable**: Every decision is traceable to a specific strategy version
- ✅ **Recover Gracefully**: Full version control with one-click rollback

## 🚀 Status: Phase 3 Complete (Prototype)

We have successfully built the core functional prototype.

- **Core Engine**: Intent Analysis -> Strategic Planning -> Execution Loop
- **Skill System**: Knowledge injection via Markdown files (`.md` skills in `packages/core/skills` or `~/.lydia/skills`)
- **MCP Integration**: Full support for Model Context Protocol (Internal & External Servers)
- **Git Integration**: Autonomous version control capabilities
- **CLI**: Interactive terminal interface with real-time feedback

## 🛠️ Installation & Usage

```bash
# 1. Install dependencies
pnpm install

# 2. Build the project
pnpm build

# 3. Configure (Optional)
# Create ~/.lydia/config.json to add external MCP servers

# 4. Run the Agent
# Example: Ask Lydia to check git status
pnpm tsx packages/cli/src/index.ts run "check git status"
```

## 📚 Documentation

- [Architecture Overview](./docs/architecture.md)
- [Configuration Guide](./packages/core/src/config/README.md)

## 🛣️ Roadmap

### Phase 1: Foundation (Completed)
- [x] Project structure (Monorepo)
- [x] Core Strategy Engine (Planner, Agent, Intent)
- [x] LLM Abstraction (Anthropic Provider)
- [x] CLI Client

### Phase 2: Capabilities (Completed)
- [x] MCP SDK Integration
- [x] Built-in Servers: Shell, FileSystem
- [x] Context Variable Substitution

### Phase 3: Expansion (Completed)
- [x] **Skill System**: Loader, Registry, Parser
- [x] **Git MCP Server**: Autonomous git operations
- [x] **Configuration System**: `~/.lydia/config.json` support
- [x] External MCP Server Support

### Phase 4: Intelligence & Safety (Next)
- [ ] Long-term Memory (SQLite)
- [ ] Human-in-the-loop (AskUserQuestion)
- [ ] Offline Replay Validation
- [ ] Web Dashboard

## 🤝 Contributing

Lydia is in early development. Contributions are welcome!

## 📄 License

MIT License - see [LICENSE](./LICENSE) for details.
