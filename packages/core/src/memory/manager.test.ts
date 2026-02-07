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
      input: 'Test task',
      plan: '{"steps":[]}',
      result: 'ok',
      created_at: Date.now(),
    });

    const episode = memory.getEpisode(id);
    expect(episode?.input).toBe('Test task');

    const list = memory.listEpisodes(10);
    expect(list.length).toBeGreaterThanOrEqual(1);
  });
});
