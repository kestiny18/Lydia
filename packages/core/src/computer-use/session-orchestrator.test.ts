import { describe, expect, it } from 'vitest';
import { ComputerUseSessionOrchestrator } from './session-orchestrator.js';
import { McpCanonicalCapabilityAdapter } from './adapter.js';
import type { ComputerUseActionEnvelope } from './runtime-contract.js';

function createAction(
  sessionId: string,
  overrides: Partial<ComputerUseActionEnvelope> = {},
): ComputerUseActionEnvelope {
  return {
    sessionId,
    actionId: `action-${Date.now()}`,
    domain: 'browser',
    canonicalAction: 'browser_navigate',
    args: { url: 'https://example.com' },
    riskLevel: 'low',
    requestedAt: Date.now(),
    ...overrides,
  };
}

describe('ComputerUseSessionOrchestrator', () => {
  it('dispatches canonical action and emits checkpoint updates', async () => {
    const orchestrator = new ComputerUseSessionOrchestrator();
    const adapter = new McpCanonicalCapabilityAdapter();
    const checkpoints: any[] = [];
    const verifications: any[] = [];
    orchestrator.on('checkpoint.save', (payload) => checkpoints.push(payload));
    orchestrator.on('verification', (payload) => verifications.push(payload));

    const result = await orchestrator.dispatchCanonicalAction({
      taskId: 'task-1',
      action: createAction('session-1'),
      adapter,
      toolName: 'browser_navigate',
      invokeTool: async () => ({
        content: [{ type: 'text', text: 'ok' }],
      }),
    });

    expect(result.sessionId).toBe('session-1');
    expect(result.checkpoint.latestFrameIds.length).toBe(1);
    expect(checkpoints.length).toBe(1);
    expect(verifications).toHaveLength(1);
    expect(verifications[0]).toMatchObject({
      sessionId: 'session-1',
      ok: true,
    });
  });

  it('tracks verification failures when adapter throws', async () => {
    const orchestrator = new ComputerUseSessionOrchestrator();
    const adapter = new McpCanonicalCapabilityAdapter();

    await expect(
      orchestrator.dispatchCanonicalAction({
        taskId: 'task-2',
        action: createAction('session-2'),
        adapter,
        toolName: 'browser_click',
        invokeTool: async () => {
          throw new Error('click failed');
        },
      }),
    ).rejects.toMatchObject({
      code: 'EXECUTION_FAILED',
    });

    const checkpoint = orchestrator.getCheckpoint('session-2');
    expect(checkpoint?.verificationFailures).toBe(1);
  });

  it('ends session and returns terminal checkpoint', async () => {
    const orchestrator = new ComputerUseSessionOrchestrator();
    orchestrator.startSession('task-3', 'session-3');
    const checkpoint = orchestrator.endSession('session-3');
    expect(checkpoint?.sessionId).toBe('session-3');
    expect(orchestrator.getCheckpoint('session-3')).toBeUndefined();
  });

  it('restores session state from checkpoint snapshot', () => {
    const orchestrator = new ComputerUseSessionOrchestrator();
    orchestrator.restoreCheckpoint({
      sessionId: 'session-restore',
      taskId: 'task-restore',
      lastActionId: 'action-10',
      latestFrameIds: ['frame-10'],
      verificationFailures: 2,
      updatedAt: Date.now(),
    });

    const checkpoint = orchestrator.getCheckpoint('session-restore');
    expect(checkpoint?.lastActionId).toBe('action-10');
    expect(checkpoint?.verificationFailures).toBe(2);
  });
});
