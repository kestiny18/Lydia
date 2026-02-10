import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { simpleGit, type SimpleGit } from "simple-git";

export class GitServer {
  public server: Server;
  private git: SimpleGit;

  constructor(baseDir: string = process.cwd()) {
    this.git = simpleGit(baseDir);
    this.server = new Server(
      {
        name: "internal-git",
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
            name: "git_status",
            description: "Show the working tree status",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
          {
            name: "git_log",
            description: "Show commit logs",
            inputSchema: {
              type: "object",
              properties: {
                maxCount: {
                  type: "number",
                  description: "Maximum number of commits to show (default: 10)",
                },
              },
            },
          },
          {
            name: "git_diff",
            description: "Show changes between commits, commit and working tree, etc",
            inputSchema: {
              type: "object",
              properties: {
                cached: {
                  type: "boolean",
                  description: "Show staged changes",
                },
              },
            },
          },
          {
            name: "git_add",
            description: "Add file contents to the index",
            inputSchema: {
              type: "object",
              properties: {
                files: {
                  type: "array",
                  items: { type: "string" },
                  description: "List of files to add. Use ['.'] for all files.",
                },
              },
              required: ["files"],
            },
          },
          {
            name: "git_commit",
            description: "Record changes to the repository",
            inputSchema: {
              type: "object",
              properties: {
                message: {
                  type: "string",
                  description: "Commit message",
                },
              },
              required: ["message"],
            },
          },
          {
            name: "git_push",
            description: "Update remote refs along with associated objects",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
          {
            name: "git_pull",
            description: "Fetch from and integrate with another repository or a local branch",
            inputSchema: {
              type: "object",
              properties: {},
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
          case "git_status":
            const status = await this.git.status();
            result = JSON.stringify(status, null, 2);
            break;

          case "git_log":
            const log = await this.git.log({ maxCount: (args as any)?.maxCount || 10 });
            result = JSON.stringify(log.all, null, 2);
            break;

          case "git_diff":
            const diffArgs = [];
            if ((args as any)?.cached) diffArgs.push("--cached");
            result = await this.git.diff(diffArgs);
            break;

          case "git_add":
            const files = (args as any)?.files;
            if (Array.isArray(files)) {
              await this.git.add(files);
              result = `Added files: ${files.join(", ")}`;
            } else {
              throw new Error("Files must be an array");
            }
            break;

          case "git_commit":
            const message = (args as any)?.message;
            if (typeof message === "string") {
              const commitResult = await this.git.commit(message);
              result = `Committed: ${commitResult.commit} ${commitResult.summary}`;
            } else {
              throw new Error("Message must be a string");
            }
            break;

          case "git_push":
            await this.git.push();
            result = "Push successful";
            break;

          case "git_pull":
            await this.git.pull();
            result = "Pull successful";
            break;

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
              text: `Error executing ${name}: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    });
  }
}
