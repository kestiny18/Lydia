import * as path from 'node:path';
import * as os from 'node:os';
import type { StrategyProposal } from '../memory/manager.js';
import { MemoryManager } from '../memory/manager.js';
import type { ValidationResult } from './validators.js';

export interface ReviewRequest {
    id: number;
    source: string; // e.g. 'self_evolution', 'foundry'
    timestamp: number;
    branchName: string; // The branch waiting for approval
    strategyId: string;
    strategyPath: string;
    diffSummary: string;
    validationResult: ValidationResult;
    analysis?: string;
    description?: string;
    status: 'pending' | 'approved' | 'rejected';
}

export class ReviewManager {
    private memory: MemoryManager;

    constructor(memoryManager?: MemoryManager) {
        if (memoryManager) {
            this.memory = memoryManager;
            return;
        }
        const dbPath = path.join(os.homedir(), '.lydia', 'memory.db');
        this.memory = new MemoryManager(dbPath);
    }

    async init() {
        // No-op: MemoryManager handles DB initialization.
    }

    async addRequest(request: Omit<ReviewRequest, 'id' | 'timestamp' | 'status'>): Promise<number> {
        const evaluation = {
            type: 'review_request',
            source: request.source,
            analysis: request.analysis,
            description: request.description,
            diffSummary: request.diffSummary,
            validation: request.validationResult,
            strategyId: request.strategyId,
            branch: {
                name: request.branchName,
                path: request.strategyPath
            }
        };

        const proposalStatus = request.validationResult.status === 'REJECT' ? 'invalid' : 'pending_human';
        const id = this.memory.recordStrategyProposal({
            strategy_path: request.strategyPath,
            status: proposalStatus,
            reason: request.validationResult.reason,
            evaluation_json: JSON.stringify(evaluation),
            created_at: Date.now(),
            decided_at: proposalStatus === 'invalid' ? Date.now() : undefined
        });

        return id;
    }

    async listPending(): Promise<ReviewRequest[]> {
        const proposals = this.memory.listStrategyProposals(200);
        const pending = proposals.filter((p) => p.status === 'pending_human');
        return pending
            .map((proposal) => this.toReviewRequest(proposal))
            .filter((req): req is ReviewRequest => req !== undefined);
    }

    async getRequest(id: number): Promise<ReviewRequest | undefined> {
        const proposal = this.memory.getStrategyProposal(id);
        if (!proposal) return undefined;
        return this.toReviewRequest(proposal);
    }

    async updateStatus(id: number, status: 'approved' | 'rejected'): Promise<void> {
        const ok = this.memory.updateStrategyProposal(id, status);
        if (!ok) throw new Error(`Request ${id} not found`);
    }

    private parseEvaluation(raw?: string | null): any | null {
        if (!raw) return null;
        try {
            return JSON.parse(raw);
        } catch {
            return null;
        }
    }

    private mapStatus(status: StrategyProposal['status']): ReviewRequest['status'] {
        if (status === 'approved') return 'approved';
        if (status === 'rejected') return 'rejected';
        return 'pending';
    }

    private toReviewRequest(proposal: StrategyProposal): ReviewRequest | undefined {
        if (!proposal.id) return undefined;
        const evaluation = this.parseEvaluation(proposal.evaluation_json);
        if (!evaluation) return undefined;
        const isReviewRequest = evaluation.type === 'review_request' || typeof evaluation.source === 'string';
        if (!isReviewRequest) return undefined;

        const branchName = evaluation.branch?.name || '';
        const strategyPath = evaluation.branch?.path || proposal.strategy_path || '';
        const validationResult = evaluation.validation || evaluation.validationResult || { status: 'NEEDS_HUMAN' };

        return {
            id: proposal.id,
            source: evaluation.source || 'unknown',
            timestamp: proposal.created_at,
            branchName,
            strategyId: evaluation.strategyId || '',
            strategyPath,
            diffSummary: evaluation.diffSummary || '',
            validationResult,
            analysis: evaluation.analysis,
            description: evaluation.description,
            status: this.mapStatus(proposal.status)
        };
    }
}
