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
          {
            name: "fs_copy_file",
            description: "Copy one file to another path",
            inputSchema: {
              type: "object",
              properties: {
                from: { type: "string", description: "Source file path" },
                to: { type: "string", description: "Destination file path" },
                overwrite: { type: "boolean", description: "Overwrite destination if it exists (default false)" },
              },
              required: ["from", "to"],
            },
          },
          {
            name: "fs_move_file",
            description: "Move or rename a file",
            inputSchema: {
              type: "object",
              properties: {
                from: { type: "string", description: "Source file path" },
                to: { type: "string", description: "Destination file path" },
                overwrite: { type: "boolean", description: "Overwrite destination if it exists (default false)" },
              },
              required: ["from", "to"],
            },
          },
          {
            name: "fs_search",
            description: "Search files and directories by name under a base path",
            inputSchema: {
              type: "object",
              properties: {
                path: { type: "string", description: "Base directory path" },
                pattern: { type: "string", description: "Case-insensitive substring or regex pattern (/.../)" },
                maxResults: { type: "number", description: "Maximum number of matches (default 100)" },
              },
              required: ["path", "pattern"],
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
          case "fs_copy_file": {
            const fromPath = this.validatePath(args.from);
            const toPath = this.validatePath(args.to);
            const overwrite = Boolean(args.overwrite);
            await this.ensureDestWritable(toPath, overwrite);
            await fs.mkdir(path.dirname(toPath), { recursive: true });
            await fs.copyFile(fromPath, toPath);
            return {
              content: [{ type: "text", text: `Successfully copied ${fromPath} -> ${toPath}` }],
            };
          }
          case "fs_move_file": {
            const fromPath = this.validatePath(args.from);
            const toPath = this.validatePath(args.to);
            const overwrite = Boolean(args.overwrite);
            await this.ensureDestWritable(toPath, overwrite);
            await fs.mkdir(path.dirname(toPath), { recursive: true });
            await this.moveFile(fromPath, toPath);
            return {
              content: [{ type: "text", text: `Successfully moved ${fromPath} -> ${toPath}` }],
            };
          }
          case "fs_search": {
            const basePath = this.validatePath(args.path);
            const pattern = String(args.pattern || '').trim();
            const maxResults = Math.max(1, Number(args.maxResults) || 100);
            if (!pattern) throw new Error('pattern is required');
            const matches = await this.searchByName(basePath, pattern, maxResults);
            return {
              content: [{ type: "text", text: matches.join('\n') }],
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

  private async ensureDestWritable(destPath: string, overwrite: boolean): Promise<void> {
    try {
      await fs.access(destPath);
      if (!overwrite) {
        throw new Error(`Destination already exists: ${destPath}. Pass overwrite=true to replace.`);
      }
      await fs.rm(destPath, { recursive: true, force: true });
    } catch (error: any) {
      if (error?.code === 'ENOENT') return;
      throw error;
    }
  }

  private async moveFile(fromPath: string, toPath: string): Promise<void> {
    try {
      await fs.rename(fromPath, toPath);
    } catch (error: any) {
      if (error?.code !== 'EXDEV') throw error;
      await fs.copyFile(fromPath, toPath);
      await fs.unlink(fromPath);
    }
  }

  private async searchByName(basePath: string, pattern: string, maxResults: number): Promise<string[]> {
    const matcher = this.buildMatcher(pattern);
    const results: string[] = [];
    const queue: string[] = [basePath];

    while (queue.length > 0 && results.length < maxResults) {
      const current = queue.shift();
      if (!current) break;
      const entries = await fs.readdir(current, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(current, entry.name);
        const relative = path.relative(this.allowedRootDir, fullPath) || '.';
        if (matcher(entry.name)) {
          results.push(`${entry.isDirectory() ? '[DIR]' : '[FILE]'} ${relative}`);
          if (results.length >= maxResults) break;
        }
        if (entry.isDirectory()) {
          queue.push(fullPath);
        }
      }
    }

    return results;
  }

  private buildMatcher(pattern: string): (name: string) => boolean {
    const regexMatch = pattern.match(/^\/(.+)\/([a-z]*)$/i);
    if (regexMatch) {
      const body = regexMatch[1];
      const flags = regexMatch[2];
      const regex = new RegExp(body, flags);
      return (name: string) => regex.test(name);
    }
    const lowered = pattern.toLowerCase();
    return (name: string) => name.toLowerCase().includes(lowered);
  }
}
