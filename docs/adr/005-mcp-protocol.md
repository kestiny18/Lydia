# ADR-005: Adopt MCP Protocol for Tool Execution Layer

## Status

**Decided** - 2025-02-05 (Updated 2025-02-06: Added Skill System clarification)

## Context

Lydia needs to determine its "hands and feet" — the tool system for executing specific tasks. Options considered:

1. **Proprietary Tool Protocol**: Fully custom tool interface.
2. **Adapt Multiple Protocols**: Support OpenAI Functions, LangChain Tools, etc.
3. **Adopt MCP Protocol**: Use Model Context Protocol introduced by Anthropic.

Our Needs:
- Ability to reuse Claude Code's Skills.
- Mature TypeScript SDK.
- Rich ecosystem with ready-to-use tools.
- Support for dynamic tool discovery.

## Decision

**Adopt MCP (Model Context Protocol) as Lydia's tool execution protocol.**

## MCP Protocol Introduction

MCP is an open standard introduced by Anthropic in November 2024 to connect AI Agents with external tools/data sources.

### Core Concepts

```
┌─────────────────┐
│   MCP Client    │  ← Lydia implements this layer
│   (AI Agent)    │
└────────┬────────┘
         │ JSON-RPC over stdio/HTTP
         ▼
┌─────────────────┐
│   MCP Server    │  ← Tool providers implement this
│   (Tool/Data)   │
└─────────────────┘
```

### Capabilities Provided by MCP

| Capability | Description |
|------------|-------------|
| **Tools** | Callable functions/operations |
| **Resources** | Readable data sources |
| **Prompts** | Predefined prompt templates |
| **Sampling** | Requesting LLM to generate content |

## Rationale

### 1. Ecosystem Compatibility

Adopting MCP allows us to:
- Access community-developed MCP Servers.
- Be compatible with mainstream AI Agent toolchains like Claude Code.
- Reuse a rich third-party tool ecosystem.

### 2. Mature TypeScript SDK

```typescript
// Official SDK Example
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

const client = new Client({
  name: "lydia",
  version: "1.0.0"
});

// Connect to MCP Server
await client.connect(transport);

// Call Tool
const result = await client.callTool({
  name: "read_file",
  arguments: { path: "/path/to/file" }
});
```

### 3. Rich Ecosystem

Existing MCP Servers include:
- File system operations
- Git operations
- Database access
- Web search
- Browser control
- Various SaaS integrations

### 4. Focus on Core Value

Adopting a standard protocol allows us to:
- Avoid reinventing the wheel.
- Focus on the Strategy Engine (Lydia's core differentiator).
- Quickly gain rich execution capabilities.

## Architecture Design

```
┌─────────────────────────────────────────────────────────────┐
│                        Lydia Core                           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  Strategy Engine                    │   │
│  │   (Intent → Planning → Decision → Reflection)       │   │
│  └─────────────────────────────────────────────────────┘   │
│                            │                                │
│                            ▼                                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │               MCP Client Manager                     │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │   │
│  │  │ Tool Reg.   │  │ Conn. Mgr   │  │ Call Router │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  │   │
│  └─────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────┘
                             │ MCP Protocol
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Built-in Server │  │  Claude Code    │  │  3rd Party/     │
│  (fs, shell)    │  │  Skills         │  │  Custom MCP     │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

### MCP Client Manager Responsibilities

| Component | Responsibility |
|-----------|----------------|
| **Tool Registry** | Maintains metadata of all available tools |
| **Conn. Manager** | Manages connections to various MCP Servers |
| **Call Router** | Routes calls to the correct Server based on tool name |

## Implementation Plan

### Phase 1: Basic Integration
- Integrate `@modelcontextprotocol/sdk`.
- Implement MCP Client Manager.
- Support stdio and HTTP transport.

### Phase 2: Built-in Servers
- Implement File System MCP Server.
- Implement Shell Command MCP Server.
- Implement Basic Web Op Server.

### Phase 3: Ecosystem Connection
- Support loading third-party MCP Servers.
- Support Claude Code Skills.
- Provide Server development templates.

## Consequences

### Positive
- High development efficiency, using mature SDK.
- Ecosystem compatibility, rich available tools.
- Standardization, facilitating community contribution.
- Seamless reuse of Claude Code Skills.

### Negative
- Dependency on external protocol standard, need to track updates.
- MCP protocol is still evolving, changes possible.

### Mitigation
- Encapsulate MCP Client as an independent module to isolate changes.
- Monitor MCP protocol updates and adapt in time.
- Retain extension interface to support other protocols in future.

## Relationship with Skill System

> **Important Clarification**: MCP and Skill are two independent systems solving different problems.

```
┌─────────────────────────────────────────────────────────────┐
│                        Strategy Engine                      │
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
│  └─────────────────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

| Dimension | Skill | MCP |
|:----------|:------|:----|
| **Essence** | Markdown + YAML Config | JSON-RPC Service Protocol |
| **Role** | Tells Lydia **HOW** (Experience) | Gives Lydia **ABILITY** (Hands/Feet) |
| **Implementation** | Parse Text Files | Maintain Service Connection |
| **User Ext.** | Write Markdown | Implement MCP Server |

Example collaboration: Skill defines "Code Review Process", MCP provides "Read File" and "Git Diff" capabilities.

See [ADR-006: Skill System](./006-skill-system.md) for details.

## References

- [MCP Official Docs](https://modelcontextprotocol.io)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Claude Code MCP Integration](https://claude.com)
- [MCP Server Market](https://mcpmarket.com)

---

**Deciders**: Project Lead
**Consulted**: Claude (AI Assistant)
