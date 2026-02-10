# Changelog

All notable changes to this project will be documented in this file.

## 0.3.0

### Skill System Overhaul — Progressive Disclosure, Hot-Reload, Community Compatibility

#### Two-Phase Progressive Loading
- Split `Skill` type into `SkillMeta` (lightweight metadata) and `StaticSkill` (full content)
- Phase 1 (startup): Load only YAML frontmatter metadata — no content bodies in memory
- Phase 2 (on-demand): Lazy-load full content only for top-K matched skills
- Dramatic reduction in memory usage when many skills are registered

#### Progressive Prompt Injection
- System prompt now uses two layers:
  - Layer 1: Lightweight catalog of ALL registered skills (name + description + tags)
  - Layer 2: Full content of only top-K matched skills (default K=3)
- Significant token savings — 50 skills registered but only ~3 get full content in prompt

#### Hot-Reload
- New `SkillWatcher` class watches all skill directories via `fs.watch()` with 300ms debounce
- Skills added/modified/deleted on disk are automatically reflected without restart
- Emits `skill:added`, `skill:updated`, `skill:removed` events

#### Community Skill Compatibility
- `SkillMetaSchema` uses `.passthrough()` — extra fields from community skills are accepted
- Added `tags` field to skill schema (used in TF-IDF matching with weight 2.5)
- Compatible with Claude Code community SKILL.md format

#### TF-IDF Matching Enhancements
- Added `topK` parameter to `match()` (default 3) to limit results
- Added `tags` matching with weight 2.5 (between name 3.0 and description 2.0)
- Added `unregister()` method for hot-reload delete support
- Fixed type safety: replaced `(skill as any).content` with proper type guards

#### allowedTools Runtime Enforcement
- When matched skills specify `allowedTools`, the tool set passed to the LLM is filtered accordingly
- Soft enforcement: restricts what tools the LLM sees in the current request

#### CLI Skills Management
- `lydia skills list` — List all loaded skills with metadata and source paths
- `lydia skills info <name>` — Show full details and content of a skill
- `lydia skills install <source>` — Install from GitHub URL or local path
- `lydia skills remove <name>` — Remove a user-installed skill
- Supports `--project` flag for project-local installation

#### Configuration
- New `config.skills` section: `matchTopK` (default 3), `hotReload` (default true), `extraDirs` (default [])

#### Type System
- New type guards: `isDynamicSkill()`, `hasContent()`, `getSkillContent()`
- Legacy `SkillSchema` alias preserved for backward compatibility
- `DynamicSkill` interface extended with `tags` field

#### Test Coverage
- 42 tests covering: registry, parser, topK, tags, unregister, parseMeta, passthrough schema, type guards, schema validation

## 0.2.0

### Agentic Loop (P0)
- Replaced "plan + sequential execute" with LLM-driven iterative agentic loop
- Unified `ToolDefinition` type for LLM function calling across all providers
- MCP tool schemas automatically converted to OpenAI/Anthropic/Ollama function calling format
- Agent loop: `tool_use` → execute → result → LLM decides next step → `end_turn` to finish

### Streaming Output (P1)
- Defined `StreamChunk` discriminated union type (text_delta, thinking_delta, tool_use_start/delta/end, message_stop, error)
- Implemented `generateStream` on all providers: Anthropic (raw stream events), OpenAI (async iterable), Ollama (NDJSON)
- Agent emits `stream:text` and `stream:thinking` events for real-time display
- CLI renders streamed text with `process.stdout.write()` for character-by-character output
- Non-streaming `generate()` preserved as configurable fallback (`config.agent.streaming`)

### Multi-turn Conversation (P1)
- Extracted shared `agenticLoop()` method from `run()`
- New `Agent.chat(message)` API with persistent session messages
- New `Agent.resetSession()` to clear conversation state
- CLI `lydia chat` command: interactive REPL with `/exit`, `/reset`, `/help`
- Server API: `POST /api/chat/start`, `POST /api/chat/:id/message`, `DELETE /api/chat/:id`

### Error Recovery (P2)
- LLM call retry with exponential backoff (1s, 2s, 4s) for rate limits, 5xx, timeouts
- Tool execution errors returned to LLM as `tool_result` with `is_error: true` for self-correction
- New config options: `agent.maxRetries` (default 3), `agent.retryDelayMs` (default 1000)

### Tool Namespace (P2)
- Automatic collision detection when tools from different MCP servers share names
- Conflicting tools auto-prefixed with `{serverId}/{toolName}`
- `callTool()` transparently resolves prefixed names back to originals

### Skill System Enhancement (P2)
- DynamicSkill tools registered to LLM function calling alongside MCP tools
- Agentic loop routes skill tool calls to `skill.execute()` instead of MCP
- Replaced simple keyword matching with TF-IDF weighted scoring (name 3x, description 2x, content 1x)
- Stopword filtering, relevance threshold, partial/prefix match bonus

### Dashboard WebSocket (P2)
- Server-side WebSocket endpoint (`/ws`) via `@hono/node-ws`
- All agent events broadcast in real-time: stream:text, tool:start/complete/error, task lifecycle
- Frontend `useWebSocket` hook with auto-reconnect and exponential backoff
- TaskRunner shows live streamed text, tool progress, and event log
- Graceful fallback to HTTP polling when WebSocket unavailable

### Test Coverage (P2)
- Agent loop tests: text response, tool_use, multi-turn simulation, maxIterations, streaming
- Skill system tests: register/get/list, TF-IDF matching, DynamicSkill integration
- MCP client tests: tool definitions, namespace collision, callTool error handling
- Streaming tests: chunk types, tool_use streaming, FallbackProvider delegation

## 0.1.0
- Strategy externalization, update gate, and replay evaluation
- Risk controls with approvals and revoke flow
- Provider support: Anthropic, OpenAI, Ollama, and Mock
- Auto fallback order support with configurable priority
- CLI + Dashboard workflow for tasks, proposals, and replays
