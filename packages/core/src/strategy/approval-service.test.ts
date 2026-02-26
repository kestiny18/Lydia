import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { MemoryManager } from '../memory/manager.js';
import { StrategyApprovalService } from './approval-service.js';

describe('StrategyApprovalService', () => {
  const dbFiles: string[] = [];

  afterEach(() => {
    for (const file of dbFiles) {
      try {
        fs.rmSync(file, { force: true });
      } catch {
        // Ignore cleanup errors.
      }
    }
    dbFiles.length = 0;
  });

  function createMemory(): MemoryManager {
    const dbPath = path.join(os.tmpdir(), `lydia-approval-service-${Date.now()}-${Math.random()}.db`);
    dbFiles.push(dbPath);
    return new MemoryManager(dbPath);
  }

  it('approves a pending proposal and updates active strategy path', async () => {
    const memory = createMemory();
    const proposalId = memory.recordStrategyProposal({
      strategy_path: '/tmp/strategy-a.yml',
      status: 'pending_human',
      created_at: Date.now(),
    });

    let activePath = '';
    const fakeLoader = {
      async load() {
        return {
          strategy: {
            activePath: '',
            approvalCooldownDays: 0,
            approvalDailyLimit: 10,
            replayEpisodes: 10,
          }
        };
      },
      async update(partial: any) {
        activePath = partial?.strategy?.activePath || activePath;
        return partial;
      }
    } as any;

    const service = new StrategyApprovalService(memory, fakeLoader);
    const result = await service.approveProposal(proposalId);

    expect(result.activePath).toBe('/tmp/strategy-a.yml');
    expect(activePath).toBe('/tmp/strategy-a.yml');
    expect(memory.getStrategyProposal(proposalId)?.status).toBe('approved');
  });

  it('rejects a pending proposal', async () => {
    const memory = createMemory();
    const proposalId = memory.recordStrategyProposal({
      strategy_path: '/tmp/strategy-b.yml',
      status: 'pending_human',
      created_at: Date.now(),
    });

    const service = new StrategyApprovalService(memory, {
      async load() {
        return { strategy: { approvalCooldownDays: 7, approvalDailyLimit: 1 } };
      },
      async update() {
        return {};
      }
    } as any);

    await service.rejectProposal(proposalId, 'not safe enough');
    const updated = memory.getStrategyProposal(proposalId);
    expect(updated?.status).toBe('rejected');
    expect(updated?.reason).toBe('not safe enough');
  });

  it('enforces approval cooldown', async () => {
    const memory = createMemory();
    const proposalId = memory.recordStrategyProposal({
      strategy_path: '/tmp/strategy-c.yml',
      status: 'pending_human',
      created_at: Date.now(),
    });
    memory.rememberFact(String(Date.now()), 'strategy.approval.last', ['strategy', 'approval']);

    const service = new StrategyApprovalService(memory, {
      async load() {
        return {
          strategy: {
            approvalCooldownDays: 7,
            approvalDailyLimit: 10,
          }
        };
      },
      async update() {
        return {};
      }
    } as any);

    await expect(service.approveProposal(proposalId)).rejects.toThrow('Approval cooldown active (7 days).');
    expect(memory.getStrategyProposal(proposalId)?.status).toBe('pending_human');
  });
});

