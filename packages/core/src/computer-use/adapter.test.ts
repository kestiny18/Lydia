import { describe, expect, it } from 'vitest';
import { McpCanonicalCapabilityAdapter, normalizeComputerUseError } from './adapter.js';
import type { ComputerUseActionEnvelope } from './runtime-contract.js';

function createAction(overrides: Partial<ComputerUseActionEnvelope> = {}): ComputerUseActionEnvelope {
  return {
    sessionId: 'session-1',
    actionId: 'action-1',
    domain: 'browser',
    canonicalAction: 'browser_screenshot',
    args: {},
    riskLevel: 'low',
    requestedAt: Date.now(),
    ...overrides,
  };
}

describe('McpCanonicalCapabilityAdapter', () => {
  it('extracts text/image observations from MCP output', async () => {
    const adapter = new McpCanonicalCapabilityAdapter();
    const result = await adapter.execute(createAction(), {
      toolName: 'browser_screenshot',
      invokeTool: async () => ({
        content: [
          { type: 'text', text: 'captured' },
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: 'AAAA' },
          },
        ],
      }),
    });

    expect(result.frame.blocks.some((block) => block.type === 'text')).toBe(true);
    expect(result.frame.blocks.some((block) => block.type === 'image')).toBe(true);
  });

  it('keeps structured payload when content blocks are not available', async () => {
    const adapter = new McpCanonicalCapabilityAdapter();
    const result = await adapter.execute(createAction(), {
      toolName: 'browser_wait_for',
      invokeTool: async () => ({ ok: true, status: 'ready' }),
    });

    expect(result.frame.blocks).toEqual([
      { type: 'structured_json', payload: { ok: true, status: 'ready' } },
    ]);
  });

  it('normalizes thrown errors to execution-failed taxonomy', async () => {
    const adapter = new McpCanonicalCapabilityAdapter();
    await expect(
      adapter.execute(createAction(), {
        toolName: 'browser_click',
        invokeTool: async () => {
          throw new Error('boom');
        },
      }),
    ).rejects.toMatchObject({
      code: 'EXECUTION_FAILED',
      message: 'boom',
      retryable: true,
    });
  });
});

describe('normalizeComputerUseError', () => {
  it('returns stable execution error for unknown values', () => {
    const error = normalizeComputerUseError('raw-error');
    expect(error.code).toBe('EXECUTION_FAILED');
    expect(error.message).toBe('raw-error');
    expect(error.retryable).toBe(true);
  });
});
