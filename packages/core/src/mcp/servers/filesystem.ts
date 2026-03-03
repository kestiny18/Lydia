import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

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
          {
            name: "fs_archive",
            description: "Create a gzipped archive bundle for a file or directory",
            inputSchema: {
              type: "object",
              properties: {
                path: { type: "string", description: "Source file or directory path" },
                outputPath: { type: "string", description: "Archive output path (for example artifacts/workspace.bundle.gz)" },
                overwrite: { type: "boolean", description: "Overwrite output if it exists (default false)" },
                maxBytes: { type: "number", description: "Maximum source bytes to pack (default 20MB)" },
              },
              required: ["path", "outputPath"],
            },
          },
          {
            name: "fs_unarchive",
            description: "Extract a Lydia archive bundle into a destination directory",
            inputSchema: {
              type: "object",
              properties: {
                archivePath: { type: "string", description: "Archive file path created by fs_archive" },
                outputDir: { type: "string", description: "Destination directory for extracted files" },
                overwrite: { type: "boolean", description: "Replace destination directory if it exists (default false)" },
                maxBytes: { type: "number", description: "Maximum extracted bytes allowed (default 20MB)" },
              },
              required: ["archivePath", "outputDir"],
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
          case "fs_archive": {
            const sourcePath = this.validatePath(args.path);
            const outputPath = this.validatePath(args.outputPath);
            const overwrite = Boolean(args.overwrite);
            const maxBytes = Math.max(1024, Number(args.maxBytes) || 20 * 1024 * 1024);
            await this.ensureDestWritable(outputPath, overwrite);
            await fs.mkdir(path.dirname(outputPath), { recursive: true });
            const bundle = await this.createArchiveBundle(sourcePath, maxBytes);
            await fs.writeFile(outputPath, bundle.buffer);
            return {
              content: [{ type: "text", text: `Successfully archived ${bundle.fileCount} file(s) to ${outputPath}` }],
            };
          }
          case "fs_unarchive": {
            const archivePath = this.validatePath(args.archivePath);
            const outputDir = this.validatePath(args.outputDir);
            const overwrite = Boolean(args.overwrite);
            const maxBytes = Math.max(1024, Number(args.maxBytes) || 20 * 1024 * 1024);
            const archiveBuffer = await fs.readFile(archivePath);
            const bundle = this.parseArchiveBundle(archiveBuffer);
            const written = await this.extractArchiveBundle(bundle, outputDir, overwrite, maxBytes);
            return {
              content: [{ type: "text", text: `Successfully extracted ${written} file(s) to ${outputDir}` }],
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

  private async createArchiveBundle(sourcePath: string, maxBytes: number): Promise<{ buffer: Buffer; fileCount: number }> {
    const stat = await fs.stat(sourcePath);
    const files: Array<{ path: string; size: number; encoding: 'base64'; data: string }> = [];
    let totalBytes = 0;

    const readAndAppend = async (absolutePath: string, relativePath: string) => {
      const data = await fs.readFile(absolutePath);
      totalBytes += data.length;
      if (totalBytes > maxBytes) {
        throw new Error(`Archive exceeds maxBytes limit (${maxBytes}).`);
      }
      files.push({
        path: relativePath,
        size: data.length,
        encoding: 'base64',
        data: data.toString('base64'),
      });
    };

    if (stat.isFile()) {
      await readAndAppend(sourcePath, path.basename(sourcePath));
    } else if (stat.isDirectory()) {
      const queue: string[] = [sourcePath];
      while (queue.length > 0) {
        const current = queue.shift();
        if (!current) break;
        const entries = await fs.readdir(current, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(current, entry.name);
          if (entry.isDirectory()) {
            queue.push(fullPath);
            continue;
          }
          if (!entry.isFile()) continue;
          const relativePath = path.relative(sourcePath, fullPath) || entry.name;
          await readAndAppend(fullPath, relativePath.replace(/\\/g, '/'));
        }
      }
    } else {
      throw new Error('Only files and directories can be archived.');
    }

    const sourceRelative = path.relative(this.allowedRootDir, sourcePath).replace(/\\/g, '/');
    const bundle = {
      format: 'lydia-archive-v1',
      source: sourceRelative || '.',
      createdAt: Date.now(),
      totalBytes,
      files,
    };
    const json = JSON.stringify(bundle);
    return {
      buffer: gzipSync(Buffer.from(json, 'utf-8')),
      fileCount: files.length,
    };
  }

  private parseArchiveBundle(buffer: Buffer): {
    format: string;
    files: Array<{ path: string; encoding?: string; data?: string }>;
  } {
    const parseJson = (text: string) => JSON.parse(text) as any;
    let parsed: any;
    try {
      parsed = parseJson(gunzipSync(buffer).toString('utf-8'));
    } catch {
      parsed = parseJson(buffer.toString('utf-8'));
    }

    if (parsed?.format !== 'lydia-archive-v1' || !Array.isArray(parsed?.files)) {
      throw new Error('Unsupported archive format. Expected lydia-archive-v1.');
    }
    return parsed;
  }

  private async extractArchiveBundle(
    bundle: { files: Array<{ path: string; encoding?: string; data?: string }> },
    outputDir: string,
    overwrite: boolean,
    maxBytes: number,
  ): Promise<number> {
    await this.prepareOutputDirectory(outputDir, overwrite);

    let totalBytes = 0;
    let count = 0;
    for (const file of bundle.files) {
      const relPath = String(file.path || '').replace(/\\/g, '/');
      if (!relPath || path.isAbsolute(relPath) || relPath.includes('..')) {
        throw new Error(`Unsafe archive entry path: ${relPath || '<empty>'}`);
      }
      const targetPath = path.resolve(outputDir, relPath);
      const safeOutputDir = process.platform === 'win32' ? outputDir.toLowerCase() : outputDir;
      const safeTarget = process.platform === 'win32' ? targetPath.toLowerCase() : targetPath;
      if (!safeTarget.startsWith(safeOutputDir + path.sep) && safeTarget !== safeOutputDir) {
        throw new Error(`Archive entry escapes destination: ${relPath}`);
      }

      const data = this.decodeArchiveEntry(file);
      totalBytes += data.length;
      if (totalBytes > maxBytes) {
        throw new Error(`Unarchive exceeds maxBytes limit (${maxBytes}).`);
      }

      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.writeFile(targetPath, data);
      count += 1;
    }

    return count;
  }

  private decodeArchiveEntry(file: { encoding?: string; data?: string }): Buffer {
    if (typeof file.data !== 'string') {
      return Buffer.from('', 'utf-8');
    }
    const encoding = String(file.encoding || 'base64').toLowerCase();
    if (encoding === 'base64') {
      return Buffer.from(file.data, 'base64');
    }
    if (encoding === 'utf8' || encoding === 'utf-8') {
      return Buffer.from(file.data, 'utf-8');
    }
    throw new Error(`Unsupported archive entry encoding: ${encoding}`);
  }

  private async prepareOutputDirectory(outputDir: string, overwrite: boolean): Promise<void> {
    try {
      const stat = await fs.stat(outputDir);
      if (!stat.isDirectory()) {
        throw new Error(`Output path is not a directory: ${outputDir}`);
      }
      if (!overwrite) {
        const entries = await fs.readdir(outputDir);
        if (entries.length > 0) {
          throw new Error(`Output directory is not empty: ${outputDir}. Pass overwrite=true to replace.`);
        }
      } else {
        await fs.rm(outputDir, { recursive: true, force: true });
        await fs.mkdir(outputDir, { recursive: true });
      }
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        await fs.mkdir(outputDir, { recursive: true });
        return;
      }
      throw error;
    }
  }
}
