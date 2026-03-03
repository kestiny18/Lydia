import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { MemoryManager } from './manager.js';

describe('MemoryManager', () => {
  let dbPath: string;
  let memory: MemoryManager;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `lydia-memory-test-${Date.now()}.db`);
    memory = new MemoryManager(dbPath);
  });

  afterEach(() => {
    try {
      fs.rmSync(dbPath, { force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it('stores and retrieves facts by key', () => {
    memory.rememberFact('User approved risk action', 'risk_approval:test', ['risk_approval']);
    const fact = memory.getFactByKey('risk_approval:test');
    expect(fact?.content).toBe('User approved risk action');
    expect(fact?.tags).toContain('risk_approval');
  });

  it('filters facts by tag', () => {
    memory.rememberFact('Approval A', 'risk_approval:a', ['risk_approval']);
    memory.rememberFact('General note', 'note:1', ['note']);
    const approvals = memory.getFactsByTag('risk_approval');
    expect(approvals.length).toBe(1);
    expect(approvals[0].content).toBe('Approval A');
  });

  it('records and lists episodes', () => {
    const id = memory.recordEpisode({
      task_id: 'task-1',
      input: 'Test task',
      plan: '{"steps":[]}',
      result: 'ok',
      created_at: Date.now(),
    });

    const episode = memory.getEpisode(id);
    expect(episode?.input).toBe('Test task');

    const list = memory.listEpisodes(10);
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list[0].task_id).toBeDefined();
  });

  it('records observation frames by task and session', () => {
    memory.recordObservationFrame('task-obs', {
      sessionId: 'session-obs',
      actionId: 'action-1',
      frameId: 'frame-1',
      blocks: [{ type: 'text', text: 'ok' }],
      createdAt: Date.now(),
    });

    const byTask = memory.listObservationFramesByTask('task-obs');
    const bySession = memory.listObservationFramesBySession('session-obs');
    expect(byTask).toHaveLength(1);
    expect(bySession).toHaveLength(1);
    expect(byTask[0].frameId).toBe('frame-1');
  });

  it('cleans stale observation frames by TTL', () => {
    const old = Date.now() - (10 * 24 * 60 * 60 * 1000);
    const fresh = Date.now();
    memory.recordObservationFrame('task-old', {
      sessionId: 'session-old',
      actionId: 'action-old',
      frameId: 'frame-old',
      blocks: [{ type: 'text', text: 'old' }],
      createdAt: old,
    });
    memory.recordObservationFrame('task-new', {
      sessionId: 'session-new',
      actionId: 'action-new',
      frameId: 'frame-new',
      blocks: [{ type: 'text', text: 'new' }],
      createdAt: fresh,
    });

    const deleted = memory.cleanupStaleObservationFrames(24 * 60 * 60 * 1000);
    expect(deleted).toBe(1);
    expect(memory.listObservationFramesByTask('task-old')).toHaveLength(0);
    expect(memory.listObservationFramesByTask('task-new')).toHaveLength(1);
  });

  it('persists computer-use checkpoint fields', () => {
    memory.saveCheckpoint({
      taskId: 'task-cp',
      runId: 'run-cp',
      input: 'input',
      iteration: 2,
      messagesJson: '[]',
      tracesJson: '[]',
      systemPrompt: 'prompt',
      toolsJson: '[]',
      computerUseSessionId: 'cus-1',
      computerUseLastActionId: 'action-2',
      computerUseLatestFrameIdsJson: JSON.stringify(['frame-1']),
      computerUseVerificationFailures: 1,
      taskCreatedAt: Date.now(),
      updatedAt: Date.now(),
    });

    const checkpoint = memory.loadCheckpoint('task-cp');
    expect(checkpoint?.computerUseSessionId).toBe('cus-1');
    expect(checkpoint?.computerUseVerificationFailures).toBe(1);
  });
});
