import { describe, expect, it } from 'vitest';
import {
  COMPUTER_USE_ERROR_CODES,
  isComputerUseErrorCode,
  type ComputerUseActionEnvelope,
  type ObservationFrame,
  type ComputerUseCheckpoint,
} from './runtime-contract.js';

describe('computer-use runtime contract', () => {
  it('defines action envelope with canonical dispatch fields', () => {
    const action: ComputerUseActionEnvelope = {
      sessionId: 'session-1',
      actionId: 'action-1',
      domain: 'browser',
      canonicalAction: 'browser_navigate',
      args: { url: 'https://example.com' },
      riskLevel: 'low',
      requestedAt: Date.now(),
    };

    expect(action.sessionId).toBe('session-1');
    expect(action.domain).toBe('browser');
    expect(action.canonicalAction).toBe('browser_navigate');
  });

  it('supports multimodal observation frame blocks', () => {
    const frame: ObservationFrame = {
      sessionId: 'session-1',
      actionId: 'action-1',
      frameId: 'frame-1',
      createdAt: Date.now(),
      blocks: [
        { type: 'text', text: 'clicked submit' },
        { type: 'image', mediaType: 'image/png', dataRef: 'artifact://shot-1' },
        { type: 'artifact_ref', kind: 'download', path: '/tmp/report.csv' },
        { type: 'structured_json', payload: { status: 'ok' } },
      ],
    };

    expect(frame.blocks).toHaveLength(4);
    expect(frame.blocks.map((block) => block.type)).toEqual([
      'text',
      'image',
      'artifact_ref',
      'structured_json',
    ]);
  });

  it('defines session checkpoint with evidence references', () => {
    const checkpoint: ComputerUseCheckpoint = {
      sessionId: 'session-1',
      taskId: 'task-1',
      lastActionId: 'action-1',
      latestFrameIds: ['frame-1', 'frame-2'],
      verificationFailures: 1,
      updatedAt: Date.now(),
    };

    expect(checkpoint.latestFrameIds).toEqual(['frame-1', 'frame-2']);
    expect(checkpoint.verificationFailures).toBe(1);
  });

  it('exposes stable error taxonomy codes', () => {
    expect(COMPUTER_USE_ERROR_CODES).toEqual([
      'ARG_INVALID',
      'CAPABILITY_UNAVAILABLE',
      'POLICY_DENIED',
      'EXECUTION_FAILED',
      'OBSERVATION_MISSING',
    ]);
    expect(isComputerUseErrorCode('POLICY_DENIED')).toBe(true);
    expect(isComputerUseErrorCode('UNKNOWN')).toBe(false);
  });
});
