import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { StrategyRegistry } from './registry.js';

describe('StrategyRegistry legacy migration', () => {
  const tempFiles: string[] = [];

  afterEach(() => {
    for (const file of tempFiles) {
      try {
        fs.rmSync(file, { force: true });
      } catch {
        // Ignore cleanup errors in tests.
      }
    }
    tempFiles.length = 0;
  });

  it('loads legacy root-level strategy schema and maps to current strategy schema', async () => {
    const legacyPath = path.join(os.tmpdir(), `lydia-legacy-strategy-${Date.now()}.yml`);
    tempFiles.push(legacyPath);

    const legacyContent = [
      'id: legacy-default',
      'version: "1.0.1"',
      'name: Legacy Strategy',
      'description: Legacy format strategy file',
      'preferences:',
      '  autonomy_level: assisted',
      '  confirmation_bias: high',
      'constraints:',
      '  must_confirm:',
      '    - shell_execute',
      '    - fs_write_file',
      'evolution_limits:',
      '  max_delta: 0.15',
      '  cooldown_days: 5',
      ''
    ].join('\n');

    fs.writeFileSync(legacyPath, legacyContent, 'utf-8');

    const registry = new StrategyRegistry();
    const strategy = await registry.loadFromFile(legacyPath);

    expect(strategy.metadata.id).toBe('legacy-default');
    expect(strategy.metadata.version).toBe('1.0.1');
    expect(strategy.metadata.name).toBe('Legacy Strategy');
    expect(strategy.constraints?.mustConfirmBefore).toEqual(['shell_execute', 'fs_write_file']);
    expect(strategy.preferences?.autonomyLevel).toBe('assisted');
    expect(strategy.preferences?.userConfirmation).toBe(0.9);
    expect(strategy.evolution_limits?.maxAutonomyIncrease).toBe(0.15);
    expect(strategy.evolution_limits?.cooldownPeriod).toBe('5 days');
    expect(strategy.system.role.length).toBeGreaterThan(0);
  });
});

