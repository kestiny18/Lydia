import { describe, expect, it, vi } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { ReplayManager } from './manager.js';
import { MemoryManager } from '../memory/index.js';
import type { EvaluationResult } from './evaluator.js';

function createEvaluation(seed: number): EvaluationResult {
  return {
    taskId: `task-${seed}`,
    success: true,
    score: 0.9,
    metrics: {
      duration: 1000,
      steps: 3,
      driftDetected: false,
      riskEvents: 0,
      humanInterrupts: 0,
      observationFrames: 2,
      multimodalFrames: 1,
    },
    details: 'ok',
  };
}

describe('ReplayManager determinism', () => {
  it('reports full consistency when replay signatures match', async () => {
    const dbPath = path.join(os.tmpdir(), `lydia-replay-det-${Date.now()}.db`);
    const memory = new MemoryManager(dbPath);
    const manager = new ReplayManager(memory);
    const replaySpy = vi.spyOn(manager, 'replay').mockResolvedValue(createEvaluation(1));

    const result = await manager.replayDeterminism(1, { runs: 5, minConsistencyRate: 0.99 });
    expect(result.ok).toBe(true);
    expect(result.consistencyRate).toBe(1);
    expect(result.mismatches).toHaveLength(0);
    expect(replaySpy).toHaveBeenCalledTimes(5);

    replaySpy.mockRestore();
  });

  it('reports mismatches when replay signatures drift', async () => {
    const dbPath = path.join(os.tmpdir(), `lydia-replay-det-${Date.now()}-2.db`);
    const memory = new MemoryManager(dbPath);
    const manager = new ReplayManager(memory);
    const evaluations = [
      createEvaluation(1),
      createEvaluation(2),
      { ...createEvaluation(3), score: 0.7, details: 'different' },
    ];
    const replaySpy = vi.spyOn(manager, 'replay').mockImplementation(async () => {
      return evaluations.shift() || createEvaluation(1);
    });

    const result = await manager.replayDeterminism(2, { runs: 3, minConsistencyRate: 0.99 });
    expect(result.ok).toBe(false);
    expect(result.consistencyRate).toBeCloseTo(2 / 3);
    expect(result.mismatches).toHaveLength(1);
    expect(result.mismatches[0].run).toBe(3);
    expect(replaySpy).toHaveBeenCalledTimes(3);

    replaySpy.mockRestore();
  });
});
