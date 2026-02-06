# Configuration System

Lydia loads configuration from `~/.lydia/config.json`.

## Schema

```json
{
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
