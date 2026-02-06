import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export class ShellServer {
  public server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "internal-shell",
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
            name: "shell_execute",
            description: "Execute a shell command on the local system. Use with caution.",
            inputSchema: {
              type: "object",
              properties: {
                command: {
                  type: "string",
                  description: "The command to execute (e.g., 'ls -la', 'git status')",
                },
              },
              required: ["command"],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name === "shell_execute") {
        const command = (request.params.arguments as any).command;
        try {
          const { stdout, stderr } = await execAsync(command);
          return {
            content: [
              {
                type: "text",
                text: stdout + (stderr ? `\nSTDERR:\n${stderr}` : ""),
              },
            ],
          };
        } catch (error: any) {
          return {
            content: [
              {
                type: "text",
                text: `Error executing command: ${error.message}\n${error.stderr || ""}`,
              },
            ],
            isError: true,
          };
        }
      }
      throw new Error("Tool not found");
    });
  }
}
