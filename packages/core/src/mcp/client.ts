import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ToolDefinition } from '../llm/types.js';

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
  // Maps prefixed name -> original tool name for conflict resolution
  private nameMap: Map<string, { originalName: string; serverId: string }> = new Map();

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
      const existing = this.tools.get(tool.name);
      if (existing && existing.serverId !== serverId) {
        // Name collision detected — prefix the new tool with serverId
        const prefixedName = `${serverId}/${tool.name}`;
        console.warn(
          `Tool name collision: "${tool.name}" exists from server "${existing.serverId}". ` +
          `Registering as "${prefixedName}" for server "${serverId}".`
        );
        this.tools.set(prefixedName, { serverId, tool });
        this.nameMap.set(prefixedName, { originalName: tool.name, serverId });

        // Also prefix the existing tool if it hasn't been prefixed yet
        if (!this.nameMap.has(tool.name)) {
          const existingPrefixed = `${existing.serverId}/${tool.name}`;
          this.tools.set(existingPrefixed, existing);
          this.nameMap.set(existingPrefixed, { originalName: tool.name, serverId: existing.serverId });
          // Keep the original entry as well for backward compat
        }
      } else {
        this.tools.set(tool.name, { serverId, tool });
      }
    }
  }

  getTools(): Tool[] {
    return Array.from(this.tools.values()).map(t => t.tool);
  }

  /**
   * Get tool definitions in LLM-provider-agnostic format.
   * Converts MCP Tool schemas to ToolDefinition for use with LLM function calling.
   * Returns de-conflicted names (prefixed where necessary).
   */
  getToolDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.entries()).map(([name, { tool }]) => ({
      name,
      description: tool.description || '',
      inputSchema: tool.inputSchema as Record<string, unknown>,
    }));
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

    // Resolve prefixed name back to original name for the MCP call
    const mapping = this.nameMap.get(name);
    const actualToolName = mapping ? mapping.originalName : name;

    return client.callTool({
      name: actualToolName,
      arguments: args,
    });
  }

  async closeAll() {
    for (const client of this.clients.values()) {
      await client.close();
    }
    this.clients.clear();
    this.tools.clear();
    this.nameMap.clear();
  }
}
