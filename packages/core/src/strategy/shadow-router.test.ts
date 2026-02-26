import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { MemoryManager } from '../memory/manager.js';
import { StrategyRegistry } from './registry.js';
import { ShadowRouter } from './shadow-router.js';

function strategyYaml(id: string, version: string, name: string) {
  return [
    'metadata:',
    `  id: "${id}"`,
    `  version: "${version}"`,
    `  name: "${name}"`,
    'system:',
    '  role: "You are a test strategy."',
    '  constraints: []',
    '  goals: []',
    ''
  ].join('\n');
}

describe('ShadowRouter', () => {
  const tempFiles: string[] = [];

  afterEach(() => {
    for (const file of tempFiles) {
      try {
        fs.rmSync(file, { force: true });
      } catch {
        // ignore cleanup errors
      }
    }
    tempFiles.length = 0;
  });

  function writeTemp(content: string, suffix: string): string {
    const filePath = path.join(os.tmpdir(), `lydia-shadow-${Date.now()}-${Math.random()}-${suffix}.yml`);
    fs.writeFileSync(filePath, content, 'utf-8');
    tempFiles.push(filePath);
    return filePath;
  }

  function createMemory(): MemoryManager {
    const dbPath = path.join(os.tmpdir(), `lydia-shadow-memory-${Date.now()}-${Math.random()}.db`);
    tempFiles.push(dbPath);
    return new MemoryManager(dbPath);
  }

  function recordEpisodeWithStatus(memory: MemoryManager, strategyId: string, strategyVersion: string, failed: boolean) {
    const episodeId = memory.recordEpisode({
      input: `task-${Math.random()}`,
      plan: '{"steps":[]}',
      result: failed ? 'failed' : 'ok',
      strategy_id: strategyId,
      strategy_version: strategyVersion,
      created_at: Date.now(),
    });

    memory.recordTraces(episodeId, [{
      step_index: 0,
      tool_name: failed ? 'shell_execute' : 'fs_read_file',
      tool_args: '{}',
      tool_output: failed ? 'boom' : 'ok',
      duration: failed ? 3000 : 800,
      status: failed ? 'failed' : 'success',
    }]);
  }

  it('routes to candidate when shadow traffic is enabled and candidate is selected', async () => {
    const memory = createMemory();
    const registry = new StrategyRegistry();
    const baselinePath = writeTemp(strategyYaml('baseline-v1', '1.0.0', 'baseline'), 'baseline');
    const candidatePath = writeTemp(strategyYaml('candidate-v1', '1.0.0', 'candidate'), 'candidate');
    const router = new ShadowRouter(memory, registry, () => 0.0);

    const routed = await router.selectStrategy({
      strategy: {
        activePath: baselinePath,
        replayEpisodes: 10,
        approvalCooldownDays: 7,
        approvalDailyLimit: 1,
        shadowModeEnabled: true,
        shadowTrafficRatio: 1,
        shadowCandidatePaths: [candidatePath],
        autoPromoteEnabled: false,
        autoPromoteMinTasks: 20,
        autoPromoteMinImprovement: 0.05,
        autoPromoteConfidence: 0.95,
        shadowWindowDays: 14,
      }
    } as any);

    expect(routed.role).toBe('candidate');
    expect(routed.path).toBe(candidatePath);
    expect(routed.strategyId).toBe('candidate-v1');
  });

  it('returns an auto-promotion decision when candidate significantly outperforms baseline', async () => {
    const memory = createMemory();
    const registry = new StrategyRegistry();
    const baselinePath = writeTemp(strategyYaml('baseline-v2', '2.0.0', 'baseline'), 'baseline-2');
    const candidatePath = writeTemp(strategyYaml('candidate-v2', '2.0.0', 'candidate'), 'candidate-2');
    const router = new ShadowRouter(memory, registry, () => 0.5);

    for (let i = 0; i < 30; i += 1) {
      recordEpisodeWithStatus(memory, 'baseline-v2', '2.0.0', i < 15);
    }
    for (let i = 0; i < 30; i += 1) {
      recordEpisodeWithStatus(memory, 'candidate-v2', '2.0.0', i < 3);
    }

    const decision = await router.evaluateAutoPromotion({
      strategy: {
        activePath: baselinePath,
        replayEpisodes: 10,
        approvalCooldownDays: 7,
        approvalDailyLimit: 1,
        shadowModeEnabled: true,
        shadowTrafficRatio: 0.3,
        shadowCandidatePaths: [candidatePath],
        autoPromoteEnabled: true,
        autoPromoteMinTasks: 20,
        autoPromoteMinImprovement: 0.05,
        autoPromoteConfidence: 0.9,
        shadowWindowDays: 14,
      }
    } as any);

    expect(decision).not.toBeNull();
    expect(decision?.candidatePath).toBe(candidatePath);
    expect(decision?.successImprovement).toBeGreaterThan(0.05);
    expect((decision?.pValue || 1)).toBeLessThan(0.1);
  });
});

