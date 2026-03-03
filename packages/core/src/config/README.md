# Configuration System

Lydia loads configuration from `~/.lydia/config.json`.

## Schema

```json
{
  "server": {
    "apiToken": "",
    "sessionTtlHours": 24
  },
  "memory": {
    "checkpointTtlHours": 24,
    "observationFrameTtlHours": 168
  },
  "mcpServers": {
    "server-id": {
      "command": "executable-name",
      "args": ["arg1", "arg2"],
      "env": {
        "KEY": "VALUE"
      }
    }
  }
}
```

## Runtime Security

- `server.apiToken`: Optional API token. When set, server APIs require either:
  - `Authorization: Bearer <token>`, or
  - a session header from `POST /api/auth/session`.
- `server.sessionTtlHours`: Expiration time for issued API sessions.

## Memory Retention

- `memory.checkpointTtlHours`: TTL for resumable checkpoints.
- `memory.observationFrameTtlHours`: TTL for persisted computer-use observation frames.

## External MCP Servers

You can connect any standard MCP server (Stdio transport) by adding it to the configuration file.

### Example: SQLite Server

```json
{
  "mcpServers": {
    "sqlite": {
      "command": "uvx",
      "args": ["mcp-server-sqlite", "--db-path", "test.db"]
    }
  }
}
```

The Agent will automatically connect to these servers on startup and their tools will be available to the planner.
