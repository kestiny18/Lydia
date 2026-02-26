import * as os from 'node:os';
import * as path from 'node:path';
import { MemoryManager, type StrategyProposal } from '../memory/manager.js';
import { ConfigLoader } from '../config/loader.js';

export class StrategyApprovalService {
  private memory: MemoryManager;
  private configLoader: ConfigLoader;

  constructor(memoryManager?: MemoryManager, configLoader?: ConfigLoader) {
    if (memoryManager) {
      this.memory = memoryManager;
    } else {
      const dbPath = path.join(os.homedir(), '.lydia', 'memory.db');
      this.memory = new MemoryManager(dbPath);
    }

    this.configLoader = configLoader || new ConfigLoader();
  }

  async approveProposal(proposalId: number): Promise<{ proposal: StrategyProposal; activePath: string }> {
    if (Number.isNaN(proposalId)) {
      throw new Error('Proposal id must be a number');
    }

    const proposal = this.getPendingProposal(proposalId);
    const config = await this.configLoader.load();
    const cooldownDays = config.strategy?.approvalCooldownDays ?? 7;
    const dailyLimit = config.strategy?.approvalDailyLimit ?? 1;
    const now = Date.now();

    const lastApproval = this.memory.getFactByKey('strategy.approval.last');
    if (lastApproval?.content) {
      const lastTime = Number(lastApproval.content);
      if (!Number.isNaN(lastTime)) {
        const diffDays = (now - lastTime) / (24 * 60 * 60 * 1000);
        if (diffDays < cooldownDays) {
          throw new Error(`Approval cooldown active (${cooldownDays} days).`);
        }
      }
    }

    const dateKey = new Date(now).toISOString().slice(0, 10);
    const dailyKey = `strategy.approval.daily.${dateKey}`;
    const dailyFact = this.memory.getFactByKey(dailyKey);
    const dailyCount = dailyFact?.content ? Number(dailyFact.content) : 0;
    if (!Number.isNaN(dailyCount) && dailyCount >= dailyLimit) {
      throw new Error(`Daily approval limit reached (${dailyLimit}).`);
    }

    await this.configLoader.update({ strategy: { activePath: proposal.strategy_path } } as any);
    this.memory.updateStrategyProposal(proposalId, 'approved');
    this.memory.rememberFact(String(now), 'strategy.approval.last', ['strategy', 'approval']);
    this.memory.rememberFact(String((Number.isNaN(dailyCount) ? 0 : dailyCount) + 1), dailyKey, ['strategy', 'approval']);

    return {
      proposal,
      activePath: proposal.strategy_path,
    };
  }

  async rejectProposal(proposalId: number, reason?: string): Promise<{ proposal: StrategyProposal }> {
    if (Number.isNaN(proposalId)) {
      throw new Error('Proposal id must be a number');
    }

    const proposal = this.getPendingProposal(proposalId);
    this.memory.updateStrategyProposal(proposalId, 'rejected', reason);
    return { proposal };
  }

  private getPendingProposal(proposalId: number): StrategyProposal {
    const proposal = this.memory.getStrategyProposal(proposalId);
    if (!proposal) {
      throw new Error('Proposal not found');
    }
    if (proposal.status !== 'pending_human') {
      throw new Error(`Proposal is ${proposal.status}`);
    }
    return proposal;
  }
}

