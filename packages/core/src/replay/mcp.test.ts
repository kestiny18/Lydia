import { describe, expect, it } from 'vitest';
import { ReplayMcpClientManager } from './mcp.js';
import type { Trace } from '../memory/index.js';

describe('ReplayMcpClientManager', () => {
  it('normalizes plain text tool outputs into MCP response shape', async () => {
    const traces: Trace[] = [
      {
        step_index: 0,
        tool_name: 'shell_execute',
        tool_args: '{"command":"echo test"}',
        tool_output: 'plain output text',
        duration: 10,
        status: 'success',
      }
    ];

    const replay = new ReplayMcpClientManager(traces);
    const result = await replay.callTool('shell_execute', { command: 'echo test' });

    expect(result).toEqual({
      content: [{ type: 'text', text: 'plain output text' }]
    });
  });

  it('throws readable error when historical non-fs trace failed with plain text output', async () => {
    const traces: Trace[] = [
      {
        step_index: 0,
        tool_name: 'shell_execute',
        tool_args: '{"command":"bad-command"}',
        tool_output: 'permission denied',
        duration: 5,
        status: 'failed',
      }
    ];

    const replay = new ReplayMcpClientManager(traces);
    await expect(
      replay.callTool('shell_execute', { command: 'bad-command' })
    ).rejects.toThrow('permission denied');
  });

  it('supports stateful fs write/read even without matching historical traces', async () => {
    const replay = new ReplayMcpClientManager([]);

    const write = await replay.callTool('fs_write_file', { path: 'notes/todo.txt', content: 'hello replay' });
    expect(write.content[0].text).toContain('Successfully wrote');

    const read = await replay.callTool('fs_read_file', { path: 'notes/todo.txt' });
    expect(read).toEqual({
      content: [{ type: 'text', text: 'hello replay' }]
    });
  });

  it('lists virtual directory entries from stateful fs sandbox', async () => {
    const replay = new ReplayMcpClientManager([]);

    await replay.callTool('fs_write_file', { path: 'src/a.ts', content: 'a' });
    await replay.callTool('fs_write_file', { path: 'src/b.ts', content: 'b' });
    await replay.callTool('fs_write_file', { path: 'src/nested/c.ts', content: 'c' });

    const list = await replay.callTool('fs_list_directory', { path: 'src' });
    const text = list.content[0].text;
    expect(text).toContain('[FILE] a.ts');
    expect(text).toContain('[FILE] b.ts');
    expect(text).toContain('[DIR] nested');
  });

  it('tracks invocation, risk, and human-interrupt metrics', async () => {
    const traces: Trace[] = [
      {
        step_index: 0,
        tool_name: 'shell_execute',
        tool_args: '{"command":"echo ok"}',
        tool_output: 'ok',
        duration: 5,
        status: 'success',
      },
      {
        step_index: 1,
        tool_name: 'ask_user',
        tool_args: '{"prompt":"continue?"}',
        tool_output: 'yes',
        duration: 5,
        status: 'success',
      }
    ];

    const replay = new ReplayMcpClientManager(traces);
    await replay.callTool('shell_execute', { command: 'echo ok' });
    await replay.callTool('ask_user', { prompt: 'continue?' });

    expect(replay.getInvocationCount()).toBe(2);
    expect(replay.getRiskEventCount()).toBe(1);
    expect(replay.getHumanInterruptCount()).toBe(1);
  });

  it('supports stateful git add/commit/status flow in replay sandbox', async () => {
    const replay = new ReplayMcpClientManager([]);

    await replay.callTool('fs_write_file', { path: 'src/main.ts', content: 'console.log("v1")' });
    await replay.callTool('git_add', { files: ['src/main.ts'] });
    const commit = await replay.callTool('git_commit', { message: 'feat: add main' });
    expect(commit.content[0].text).toContain('Committed:');

    const status = await replay.callTool('git_status', {});
    const parsed = JSON.parse(status.content[0].text);
    expect(parsed.staged).toEqual([]);
    expect(parsed.modified).toEqual([]);
    expect(parsed.created).toEqual([]);
  });

  it('reports git status for unstaged modifications', async () => {
    const replay = new ReplayMcpClientManager([]);

    await replay.callTool('fs_write_file', { path: 'src/main.ts', content: 'console.log("v1")' });
    await replay.callTool('git_add', { files: ['src/main.ts'] });
    await replay.callTool('git_commit', { message: 'feat: add main' });
    await replay.callTool('fs_write_file', { path: 'src/main.ts', content: 'console.log("v2")' });

    const status = await replay.callTool('git_status', {});
    const parsed = JSON.parse(status.content[0].text);
    expect(parsed.modified).toContain('/workspace/src/main.ts');
  });
});
