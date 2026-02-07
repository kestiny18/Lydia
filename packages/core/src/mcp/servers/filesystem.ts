import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";

export class FileSystemServer {
  public server: Server;
  private allowedRootDir: string;

  constructor(allowedRootDir: string = process.cwd()) {
    this.allowedRootDir = path.resolve(allowedRootDir);
    this.server = new Server(
      {
        name: "internal-fs",
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

  private validatePath(requestedPath: string): string {
    const resolvedPath = path.resolve(this.allowedRootDir, requestedPath);
    const root = process.platform === 'win32' ? this.allowedRootDir.toLowerCase() : this.allowedRootDir;
    const target = process.platform === 'win32' ? resolvedPath.toLowerCase() : resolvedPath;
    if (!target.startsWith(root)) {
      throw new Error('Access denied: path outside allowed root');
    }
    return resolvedPath;
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "fs_read_file",
            description: "Read the content of a file",
            inputSchema: {
              type: "object",
              properties: {
                path: { type: "string", description: "Path to the file" },
              },
              required: ["path"],
            },
          },
          {
            name: "fs_write_file",
            description: "Write content to a file (overwrites existing)",
            inputSchema: {
              type: "object",
              properties: {
                path: { type: "string", description: "Path to the file" },
                content: { type: "string", description: "Content to write" },
              },
              required: ["path", "content"],
            },
          },
          {
            name: "fs_list_directory",
            description: "List files and directories in a path",
            inputSchema: {
              type: "object",
              properties: {
                path: { type: "string", description: "Directory path" },
              },
              required: ["path"],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const args = request.params.arguments as any;

      try {
        switch (request.params.name) {
          case "fs_read_file": {
            const filePath = this.validatePath(args.path);
            const content = await fs.readFile(filePath, "utf-8");
            return {
              content: [{ type: "text", text: content }],
            };
          }
          case "fs_write_file": {
            const filePath = this.validatePath(args.path);
            await fs.mkdir(path.dirname(filePath), { recursive: true });
            await fs.writeFile(filePath, args.content, "utf-8");
            return {
              content: [{ type: "text", text: `Successfully wrote to ${filePath}` }],
            };
          }
          case "fs_list_directory": {
            const dirPath = this.validatePath(args.path);
            const entries = await fs.readdir(dirPath, { withFileTypes: true });
            const list = entries.map(e => `${e.isDirectory() ? '[DIR]' : '[FILE]'} ${e.name}`).join('\n');
            return {
              content: [{ type: "text", text: list }],
            };
          }
          default:
            throw new Error(`Unknown tool: ${request.params.name}`);
        }
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    });
  }
}
