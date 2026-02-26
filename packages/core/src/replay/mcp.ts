import { McpClientManager } from '../mcp/index.js';
import type { Trace } from '../memory/index.js';
import * as path from 'node:path';

type ReplayToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

type ReplayCommit = {
  hash: string;
  message: string;
  createdAt: number;
};

export class ReplayMcpClientManager extends McpClientManager {
  private traces: Trace[];
  private callIndex = 0;
  public drifts: Array<{ index: number; expected: string; actual: string; type: 'tool' | 'args' }> = [];
  private readonly virtualRoot = '/workspace';
  private virtualFiles: Map<string, string> = new Map();
  private gitHeadFiles: Map<string, string> = new Map();
  private gitStagedFiles: Set<string> = new Set();
  private gitCommits: ReplayCommit[] = [];
  private invocationCount = 0;
  private riskEventCount = 0;
  private humanInterruptCount = 0;
  private readonly highRiskTools = new Set([
    'shell_execute',
    'fs_write_file',
    'fs_delete_file',
    'fs_delete_directory',
    'fs_move',
    'fs_copy',
    'git_push',
  ]);

  constructor(traces: Trace[]) {
    super();
    this.traces = traces;
    this.seedVirtualFileState();
    this.initializeGitState();
  }

  // Override connect to do nothing
  async connect(config: any) {
    return {} as any;
  }

  // Override callTool to return recorded output
  async callTool(name: string, args: any) {
    this.recordInvocation(name);

    if (this.isFsTool(name)) {
      return this.executeFsTool(name, args);
    }

    if (name === 'shell_execute') {
      const simulated = this.executeShellTool(args);
      if (simulated) {
        return simulated;
      }
    }

    if (this.isGitTool(name)) {
      return this.executeGitTool(name, args);
    }

    const trace = this.consumeTrace(name, args, true);
    if (!trace) {
      throw new Error(`Replay Error: No trace available for tool '${name}'.`);
    }

    // Return stored output, normalized to MCP call result shape.
    const output = this.normalizeToolOutput(trace.tool_output);

    // Simulate error if originally failed
    if (trace.status === 'failed') {
      const text = output.content
        .map((c: any) => (typeof c?.text === 'string' ? c.text : ''))
        .join('\n')
        .trim();
      throw new Error(text || 'Replay tool execution failed');
    }

    return output;
  }

  public getInvocationCount(): number {
    return this.invocationCount;
  }

  public getRiskEventCount(): number {
    return this.riskEventCount;
  }

  public getHumanInterruptCount(): number {
    return this.humanInterruptCount;
  }

  private isFsTool(name: string): boolean {
    return name === 'fs_read_file' || name === 'fs_write_file' || name === 'fs_list_directory';
  }

  private isGitTool(name: string): boolean {
    return (
      name === 'git_status' ||
      name === 'git_log' ||
      name === 'git_diff' ||
      name === 'git_add' ||
      name === 'git_commit' ||
      name === 'git_push' ||
      name === 'git_pull'
    );
  }

  private recordInvocation(name: string) {
    this.invocationCount += 1;
    if (this.highRiskTools.has(name)) {
      this.riskEventCount += 1;
    }
    if (name === 'ask_user') {
      this.humanInterruptCount += 1;
    }
  }

  private executeFsTool(name: string, args: any): ReplayToolResult {
    // Align trace pointer for matching fs calls when possible, but never force sequential consumption.
    this.consumeTrace(name, args, false);

    if (name === 'fs_write_file') {
      const rawPath = typeof args?.path === 'string' ? args.path : '';
      const content = typeof args?.content === 'string' ? args.content : '';
      if (!rawPath) {
        return { content: [{ type: 'text', text: 'Error: Missing file path.' }], isError: true };
      }
      const normalized = this.normalizeFsPath(rawPath);
      this.virtualFiles.set(normalized, content);
      return { content: [{ type: 'text', text: `Successfully wrote to ${normalized}` }] };
    }

    if (name === 'fs_read_file') {
      const rawPath = typeof args?.path === 'string' ? args.path : '';
      if (!rawPath) {
        return { content: [{ type: 'text', text: 'Error: Missing file path.' }], isError: true };
      }
      const normalized = this.normalizeFsPath(rawPath);
      if (this.virtualFiles.has(normalized)) {
        return { content: [{ type: 'text', text: this.virtualFiles.get(normalized) || '' }] };
      }
      return { content: [{ type: 'text', text: `Error: ENOENT: no such file ${normalized}` }], isError: true };
    }

    if (name === 'fs_list_directory') {
      const rawPath = typeof args?.path === 'string' ? args.path : '.';
      const normalized = this.normalizeFsPath(rawPath);
      const entries = this.listDirectoryEntries(normalized);
      const text = entries.map((entry) => `${entry.type === 'dir' ? '[DIR]' : '[FILE]'} ${entry.name}`).join('\n');
      return { content: [{ type: 'text', text }] };
    }

    return { content: [{ type: 'text', text: `Error: Unknown fs tool '${name}'` }], isError: true };
  }

  private executeShellTool(args: any): ReplayToolResult | null {
    const command = typeof args?.command === 'string' ? args.command.trim() : '';
    if (!command) {
      return { content: [{ type: 'text', text: 'Error executing command: empty command' }], isError: true };
    }

    if (command === 'pwd') {
      this.consumeTrace('shell_execute', args, false);
      return { content: [{ type: 'text', text: this.virtualRoot }] };
    }

    if (command === 'ls' || command === 'dir' || command.startsWith('ls ') || command.startsWith('dir ')) {
      this.consumeTrace('shell_execute', args, false);
      const tokens = command.split(/\s+/).slice(1).filter((token: string) => token && !token.startsWith('-'));
      const target = tokens[0] || '.';
      const entries = this.listDirectoryEntries(this.normalizeFsPath(target));
      const text = entries.map((entry) => `${entry.type === 'dir' ? '[DIR]' : '[FILE]'} ${entry.name}`).join('\n');
      return { content: [{ type: 'text', text }] };
    }

    if (command.startsWith('cat ') || command.startsWith('type ')) {
      this.consumeTrace('shell_execute', args, false);
      const filePath = command.replace(/^(cat|type)\s+/, '').trim();
      const normalized = this.normalizeFsPath(filePath);
      if (!this.virtualFiles.has(normalized)) {
        return { content: [{ type: 'text', text: `Error: ENOENT: no such file ${normalized}` }], isError: true };
      }
      return { content: [{ type: 'text', text: this.virtualFiles.get(normalized) || '' }] };
    }

    if (command.startsWith('echo ')) {
      this.consumeTrace('shell_execute', args, false);
      const output = command.slice(5);
      return { content: [{ type: 'text', text: output }] };
    }

    if (command.startsWith('git ')) {
      const git = this.mapShellGitCommand(command);
      if (!git) return null;
      return this.executeGitTool(git.name, git.args);
    }

    return null;
  }

  private mapShellGitCommand(command: string): { name: string; args: Record<string, unknown> } | null {
    const trimmed = command.trim();
    if (trimmed === 'git status') return { name: 'git_status', args: {} };
    if (trimmed === 'git log') return { name: 'git_log', args: {} };
    if (trimmed.startsWith('git log ')) {
      const countMatch = trimmed.match(/-n\s+(\d+)/);
      return { name: 'git_log', args: { maxCount: countMatch ? Number(countMatch[1]) : 10 } };
    }
    if (trimmed === 'git diff') return { name: 'git_diff', args: {} };
    if (trimmed === 'git diff --cached') return { name: 'git_diff', args: { cached: true } };
    if (trimmed === 'git add .') return { name: 'git_add', args: { files: ['.'] } };
    if (trimmed.startsWith('git add ')) {
      const files = trimmed.replace(/^git add\s+/, '').trim().split(/\s+/).filter(Boolean);
      return { name: 'git_add', args: { files } };
    }
    if (trimmed === 'git push') return { name: 'git_push', args: {} };
    if (trimmed === 'git pull') return { name: 'git_pull', args: {} };
    const commitMatch = trimmed.match(/^git commit -m\s+["'](.+)["']$/);
    if (commitMatch) return { name: 'git_commit', args: { message: commitMatch[1] } };
    return null;
  }

  private executeGitTool(name: string, args: any): ReplayToolResult {
    // Align trace pointer for matching git calls when possible, but never force sequential consumption.
    this.consumeTrace(name, args, false);

    if (name === 'git_status') {
      const changes = this.computeGitChanges();
      const staged = this.sortedArray(this.gitStagedFiles);
      const modified = this.sortedArray(
        new Set(changes.modified.filter((file) => !this.gitStagedFiles.has(file)))
      );
      const created = this.sortedArray(
        new Set(changes.created.filter((file) => !this.gitStagedFiles.has(file)))
      );
      const deleted = this.sortedArray(
        new Set(changes.deleted.filter((file) => !this.gitStagedFiles.has(file)))
      );

      const payload = {
        current: 'replay',
        staged,
        modified,
        created,
        deleted,
        not_added: created,
      };
      return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
    }

    if (name === 'git_add') {
      const files = Array.isArray(args?.files) ? (args.files as unknown[]) : null;
      if (!files) {
        return { content: [{ type: 'text', text: 'Error executing git_add: Files must be an array' }], isError: true };
      }

      const changes = this.computeGitChanges();
      const allChanged = new Set([...changes.modified, ...changes.created, ...changes.deleted]);
      if (files.some((entry) => typeof entry === 'string' && entry === '.')) {
        allChanged.forEach((file) => this.gitStagedFiles.add(file));
      } else {
        for (const entry of files) {
          if (typeof entry !== 'string') continue;
          const normalizedEntry = this.normalizeFsPath(entry);
          for (const changed of allChanged) {
            if (changed === normalizedEntry || changed.startsWith(`${normalizedEntry}/`)) {
              this.gitStagedFiles.add(changed);
            }
          }
        }
      }

      return { content: [{ type: 'text', text: `Added files: ${this.sortedArray(this.gitStagedFiles).join(', ')}` }] };
    }

    if (name === 'git_diff') {
      const cached = Boolean(args?.cached);
      const changes = this.computeGitChanges();
      const changedSet = cached
        ? new Set(this.gitStagedFiles)
        : new Set(
          [...changes.modified, ...changes.created, ...changes.deleted]
            .filter((file) => !this.gitStagedFiles.has(file))
        );

      if (changedSet.size === 0) {
        return { content: [{ type: 'text', text: '' }] };
      }

      const text = this.sortedArray(changedSet)
        .map((file) => `diff -- replay/${file}`)
        .join('\n');
      return { content: [{ type: 'text', text }] };
    }

    if (name === 'git_commit') {
      const message = typeof args?.message === 'string' ? args.message : '';
      if (!message) {
        return { content: [{ type: 'text', text: 'Error executing git_commit: Message must be a string' }], isError: true };
      }
      if (this.gitStagedFiles.size === 0) {
        return { content: [{ type: 'text', text: 'Error executing git_commit: no staged changes' }], isError: true };
      }

      for (const file of this.gitStagedFiles) {
        const content = this.virtualFiles.get(file);
        if (content === undefined) {
          this.gitHeadFiles.delete(file);
        } else {
          this.gitHeadFiles.set(file, content);
        }
      }

      const hash = `replay-${this.gitCommits.length + 1}`;
      this.gitCommits.push({
        hash,
        message,
        createdAt: Date.now(),
      });
      const changedCount = this.gitStagedFiles.size;
      this.gitStagedFiles.clear();
      return { content: [{ type: 'text', text: `Committed: ${hash} ${changedCount} files changed` }] };
    }

    if (name === 'git_log') {
      const maxCount = Number(args?.maxCount) || 10;
      const items = this.gitCommits
        .slice(-maxCount)
        .reverse()
        .map((commit) => ({
          hash: commit.hash,
          date: new Date(commit.createdAt).toISOString(),
          message: commit.message,
        }));
      return { content: [{ type: 'text', text: JSON.stringify(items, null, 2) }] };
    }

    if (name === 'git_push') {
      return { content: [{ type: 'text', text: 'Push successful' }] };
    }

    if (name === 'git_pull') {
      return { content: [{ type: 'text', text: 'Pull successful' }] };
    }

    return { content: [{ type: 'text', text: `Error executing ${name}: Tool not found` }], isError: true };
  }

  private consumeTrace(name: string, args: any, allowSequentialFallback: boolean): Trace | null {
    const targetArgs = this.stableStringify(args || {});

    const exactIndex = this.findTraceIndex(name, targetArgs, true);
    if (exactIndex >= 0) {
      return this.consumeTraceAt(exactIndex, name, targetArgs, false);
    }

    const sameToolIndex = this.findTraceIndex(name, targetArgs, false);
    if (sameToolIndex >= 0) {
      return this.consumeTraceAt(sameToolIndex, name, targetArgs, true);
    }

    if (!allowSequentialFallback) {
      return null;
    }

    const trace = this.traces[this.callIndex];
    if (!trace) return null;

    this.recordToolDrift(this.callIndex, trace.tool_name, name);
    const expectedArgs = this.stableStringify(this.safeParseJson(trace.tool_args, {}));
    if (expectedArgs !== targetArgs) {
      this.recordArgsDrift(this.callIndex, expectedArgs, targetArgs);
    }
    this.callIndex += 1;
    return trace;
  }

  private consumeTraceAt(index: number, name: string, targetArgs: string, checkArgs: boolean): Trace {
    if (index !== this.callIndex && this.callIndex < this.traces.length) {
      this.recordToolDrift(this.callIndex, this.traces[this.callIndex].tool_name, name);
    }

    const trace = this.traces[index];
    if (checkArgs) {
      const expectedArgs = this.stableStringify(this.safeParseJson(trace.tool_args, {}));
      if (expectedArgs !== targetArgs) {
        this.recordArgsDrift(index, expectedArgs, targetArgs);
      }
    }

    this.callIndex = index + 1;
    return trace;
  }

  private findTraceIndex(name: string, targetArgs: string, exactArgs: boolean): number {
    for (let i = this.callIndex; i < this.traces.length; i += 1) {
      const trace = this.traces[i];
      if (trace.tool_name !== name) continue;
      if (!exactArgs) return i;

      const traceArgs = this.stableStringify(this.safeParseJson(trace.tool_args, {}));
      if (traceArgs === targetArgs) return i;
    }
    return -1;
  }

  private recordToolDrift(index: number, expected: string, actual: string) {
    console.warn(`[Replay Drift] Expected tool '${expected}' but got '${actual}' at index ${index}`);
    this.drifts.push({ index, expected, actual, type: 'tool' });
  }

  private recordArgsDrift(index: number, expected: string, actual: string) {
    console.warn(`[Replay Drift] Arguments mismatch at index ${index}`);
    this.drifts.push({ index, expected, actual, type: 'args' });
  }

  private seedVirtualFileState() {
    for (const trace of this.traces) {
      if (trace.status !== 'success') continue;
      const args = this.safeParseJson<Record<string, unknown>>(trace.tool_args, {});

      if (trace.tool_name === 'fs_write_file') {
        const rawPath = typeof args.path === 'string' ? args.path : '';
        const content = typeof args.content === 'string' ? args.content : '';
        if (!rawPath) continue;
        this.virtualFiles.set(this.normalizeFsPath(rawPath), content);
        continue;
      }

      if (trace.tool_name === 'fs_read_file') {
        const rawPath = typeof args.path === 'string' ? args.path : '';
        if (!rawPath) continue;
        const normalized = this.normalizeFsPath(rawPath);
        if (this.virtualFiles.has(normalized)) continue;
        const output = this.normalizeToolOutput(trace.tool_output);
        const text = output.content
          .map((item) => item.text)
          .join('\n');
        this.virtualFiles.set(normalized, text);
      }
    }
  }

  private initializeGitState() {
    this.gitHeadFiles = new Map(this.virtualFiles);
    this.gitStagedFiles = new Set();
    this.gitCommits = [{
      hash: 'replay-init',
      message: 'Initial replay snapshot',
      createdAt: Date.now(),
    }];
  }

  private computeGitChanges(): { modified: string[]; created: string[]; deleted: string[] } {
    const keys = new Set<string>([
      ...this.virtualFiles.keys(),
      ...this.gitHeadFiles.keys(),
    ]);
    const modified: string[] = [];
    const created: string[] = [];
    const deleted: string[] = [];

    for (const key of keys) {
      const current = this.virtualFiles.get(key);
      const head = this.gitHeadFiles.get(key);
      if (current === undefined && head !== undefined) {
        deleted.push(key);
      } else if (current !== undefined && head === undefined) {
        created.push(key);
      } else if (current !== undefined && head !== undefined && current !== head) {
        modified.push(key);
      }
    }

    return {
      modified: modified.sort((a, b) => a.localeCompare(b)),
      created: created.sort((a, b) => a.localeCompare(b)),
      deleted: deleted.sort((a, b) => a.localeCompare(b)),
    };
  }

  private sortedArray(values: Set<string>): string[] {
    return Array.from(values.values()).sort((a, b) => a.localeCompare(b));
  }

  private normalizeFsPath(inputPath: string): string {
    const source = (inputPath || '').replace(/\\/g, '/');
    if (!source) return this.virtualRoot;

    const driveMatch = source.match(/^([a-zA-Z]):(\/.*)?$/);
    if (driveMatch) {
      const drive = driveMatch[1].toLowerCase();
      const rest = driveMatch[2] || '/';
      return path.posix.normalize(`/${drive}${rest}`);
    }

    if (source.startsWith('/')) {
      return path.posix.normalize(source);
    }

    return path.posix.normalize(path.posix.join(this.virtualRoot, source));
  }

  private listDirectoryEntries(directory: string): Array<{ type: 'file' | 'dir'; name: string }> {
    const normalizedDir = this.normalizeFsPath(directory);
    const prefix = normalizedDir.endsWith('/') ? normalizedDir : `${normalizedDir}/`;
    const entries = new Map<string, 'file' | 'dir'>();

    for (const filePath of this.virtualFiles.keys()) {
      if (filePath === normalizedDir) continue;
      if (!filePath.startsWith(prefix)) continue;

      const relative = filePath.slice(prefix.length);
      if (!relative) continue;

      const [head, ...rest] = relative.split('/');
      if (!head) continue;

      const type: 'file' | 'dir' = rest.length > 0 ? 'dir' : 'file';
      const existing = entries.get(head);
      if (existing === 'dir') continue;
      entries.set(head, type);
    }

    return Array.from(entries.entries())
      .map(([name, type]) => ({ name, type }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  private stableStringify(value: unknown): string {
    if (value === null || value === undefined) return 'null';
    if (typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableStringify(item)).join(',')}]`;
    }
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${this.stableStringify(record[key])}`).join(',')}}`;
  }

  private safeParseJson<T>(value: string, fallback: T): T {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }

  private normalizeToolOutput(rawOutput: string): { content: Array<{ type: 'text'; text: string }>; isError?: boolean } {
    const parsed = this.safeParseJson<unknown>(rawOutput, rawOutput);

    if (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray((parsed as any).content)
    ) {
      return parsed as ReplayToolResult;
    }

    if (typeof parsed === 'string') {
      return { content: [{ type: 'text', text: parsed }] };
    }

    return { content: [{ type: 'text', text: JSON.stringify(parsed) }] };
  }
}
