import { describe, expect, it, vi, beforeEach } from 'vitest';

const connectMock = vi.fn();
const closeAllMock = vi.fn();
const getToolsMock = vi.fn();

vi.mock('@lydia/core', () => {
  class MockMcpClientManager {
    connect = connectMock;
    closeAll = closeAllMock;
    getTools = getToolsMock;
  }
  return { McpClientManager: MockMcpClientManager };
});

import { checkMcpServer } from './health.js';

describe('checkMcpServer', () => {
  beforeEach(() => {
    connectMock.mockReset();
    closeAllMock.mockReset();
    getToolsMock.mockReset();
    closeAllMock.mockResolvedValue(undefined);
    getToolsMock.mockReturnValue([]);
  });

  it('returns discovered tools on success', async () => {
    connectMock.mockResolvedValue(undefined);
    getToolsMock.mockReturnValue([{ name: 'browser_navigate' }, { name: 'browser_click' }]);

    const result = await checkMcpServer({
      id: 'browser',
      command: 'npx',
      args: ['-y', 'mcp-browser'],
    });

    expect(result.ok).toBe(true);
    expect(result.tools).toEqual(['browser_navigate', 'browser_click']);
    expect(result.attempts).toBe(1);
  });

  it('retries when connect fails', async () => {
    connectMock
      .mockRejectedValueOnce(new Error('failed 1'))
      .mockResolvedValueOnce(undefined);

    const result = await checkMcpServer(
      { id: 'browser', command: 'npx', args: ['mcp-browser'] },
      { retries: 1 }
    );

    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(2);
    expect(connectMock).toHaveBeenCalledTimes(2);
  });

  it('returns timeout error when connect hangs', async () => {
    connectMock.mockImplementation(() => new Promise(() => {}));

    const result = await checkMcpServer(
      { id: 'browser', command: 'npx', args: ['mcp-browser'] },
      { timeoutMs: 20, retries: 0 }
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain('Timeout');
  });
});

