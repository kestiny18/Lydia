import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { MemoryManager } from "../../memory/index.js";

export class MemoryServer {
  public server: Server;
  private memoryManager: MemoryManager;

  constructor(memoryManager: MemoryManager) {
    this.memoryManager = memoryManager;
    this.server = new Server(
      {
        name: "internal-memory",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "remember",
            description: "Store a new fact, preference, or insight about the user or project. Use this when the user explicitly asks to remember something, or when you learn a persistent preference (e.g., 'user prefers typescript').",
            inputSchema: {
              type: "object",
              properties: {
                content: {
                  type: "string",
                  description: "The information to remember (e.g. 'The user prefers to use pnpm for all projects')",
                },
                key: {
                  type: "string",
                  description: "Optional unique key for this fact (e.g. 'preference.package_manager'). If provided, overwrites existing fact with this key.",
                },
                tags: {
                  type: "array",
                  items: { type: "string" },
                  description: "Optional tags for categorization (e.g. ['preference', 'config'])",
                }
              },
              required: ["content"],
            },
          },
          {
            name: "recall",
            description: "Search long-term memory for facts, preferences, or past solutions.",
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "Search query",
                },
              },
              required: ["query"],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        let result = "";

        switch (name) {
          case "remember": {
            const content = (args as any).content;
            const key = (args as any).key;
            const tags = (args as any).tags || [];

            if (!content) throw new Error("Content is required");

            this.memoryManager.rememberFact(content, key, tags);
            result = `Remembered: "${content}"${key ? ` (key: ${key})` : ""}`;
            break;
          }

          case "recall": {
            const query = (args as any).query;
            if (!query) throw new Error("Query is required");

            const facts = this.memoryManager.searchFacts(query);
            const episodes = this.memoryManager.recallEpisodes(query);

            let output = [];
            if (facts.length > 0) {
              output.push("Found relevant facts:");
              facts.forEach(f => output.push(`- ${f.content} (Source: Memory)`));
            }

            if (episodes.length > 0) {
              output.push("\nFound similar past episodes:");
              episodes.forEach(e => output.push(`- Task: "${e.input}" -> Result: ${e.result.substring(0, 100)}...`));
            }

            if (output.length === 0) {
              result = "No relevant memories found.";
            } else {
              result = output.join("\n");
            }
            break;
          }

          default:
            throw new Error(`Tool ${name} not found`);
        }

        return {
          content: [
            {
              type: "text",
              text: result,
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error accessing memory: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    });
  }
}
