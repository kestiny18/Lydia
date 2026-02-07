import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export interface McpServerConfig {
  id: string;
  type: 'stdio' | 'in-memory';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  transport?: InMemoryTransport; // For in-process servers
}

export class McpClientManager {
  private clients: Map<string, Client> = new Map();
  private tools: Map<string, { serverId: string; tool: Tool }> = new Map();

  async connect(config: McpServerConfig) {
    let transport;

    if (config.type === 'in-memory' && config.transport) {
      transport = config.transport;
    } else if (config.type === 'stdio' && config.command) {
      transport = new StdioClientTransport({
        command: config.command,
        args: config.args || [],
        env: config.env,
      });
    } else {
      throw new Error(`Invalid MCP server configuration: ${JSON.stringify(config)}`);
    }

    const client = new Client(
      {
        name: "lydia-client",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    await client.connect(transport);
    this.clients.set(config.id, client);

    // Discover tools immediately upon connection
    await this.refreshTools(config.id);

    return client;
  }

  async refreshTools(serverId: string) {
    const client = this.clients.get(serverId);
    if (!client) return;

    const result = await client.listTools();

    for (const tool of result.tools) {
      // Store tool with reference to which server provides it
      // Note: In a real system, we might need to handle name collisions (e.g., prefixing)
      this.tools.set(tool.name, { serverId, tool });
    }
  }

  getTools(): Tool[] {
    return Array.from(this.tools.values()).map(t => t.tool);
  }

  getToolInfo(name: string): { serverId: string; tool: Tool } | undefined {
    return this.tools.get(name);
  }

  isToolExternal(name: string): boolean {
    const info = this.tools.get(name);
    if (!info) return false;
    return !info.serverId.startsWith('internal-');
  }

  async callTool(name: string, args: any) {
    const toolInfo = this.tools.get(name);
    if (!toolInfo) {
      throw new Error(`Tool '${name}' not found.`);
    }

    const client = this.clients.get(toolInfo.serverId);
    if (!client) {
      throw new Error(`Server '${toolInfo.serverId}' for tool '${name}' is not connected.`);
    }

    return client.callTool({
      name,
      arguments: args,
    });
  }

  async closeAll() {
    for (const client of this.clients.values()) {
      await client.close();
    }
    this.clients.clear();
    this.tools.clear();
  }
}
