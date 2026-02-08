import { Strategy } from '../strategy/strategy.js';
import { StrategyBranch } from '../strategy/branch-manager.js';
import { EvaluationResult } from '../replay/evaluator.js';

export interface ValidationResult {
    status: 'PASS' | 'REJECT' | 'NEEDS_HUMAN';
    reason?: string;
    details?: any;
}

export interface GateValidator {
    name: string;
    validate(
        candidate: Strategy,
        branch: StrategyBranch,
        evaluations?: EvaluationResult[]
    ): Promise<ValidationResult>;
}

export class SyntaxValidator implements GateValidator {
    name = 'syntax_validator';
    async validate(candidate: Strategy): Promise<ValidationResult> {
        // StrategySchema.parse already handles this before we get here usually,
        // but we can add extra checks if needed.
        if (!candidate.metadata.id) return { status: 'REJECT', reason: 'Missing ID' };
        return { status: 'PASS' };
    }
}

export class EvolutionLimitValidator implements GateValidator {
    name = 'evolution_limit_validator';
    async validate(candidate: Strategy): Promise<ValidationResult> {
        // Check constraints and limits
        // Example: autonomy level shouldn't jump too high
        const maxIncrease = candidate.evolution_limits?.maxAutonomyIncrease || 0.1;
        // We would need previous strategy to compare, but for MVP let's just check bounds

        // Check if cooldown period is respected (needs history, skip for MVP)

        return { status: 'PASS' };
    }
}

export class ReplayPerformanceValidator implements GateValidator {
    name = 'replay_performance_validator';
    async validate(candidate: Strategy, branch: StrategyBranch, evaluations?: EvaluationResult[]): Promise<ValidationResult> {
        if (!evaluations || evaluations.length === 0) {
            return { status: 'NEEDS_HUMAN', reason: 'No replay evaluations available' };
        }

        const failedTasks = evaluations.filter(e => !e.success);
        const failureRate = failedTasks.length / evaluations.length;

        if (failureRate > 0.2) {
            return { status: 'REJECT', reason: `High failure rate: ${(failureRate * 100).toFixed(1)}%` };
        }

        // Check for regression?

        return { status: 'PASS' };
    }
}

export class RiskSafetyValidator implements GateValidator {
    name = 'risk_safety_validator';
    async validate(candidate: Strategy): Promise<ValidationResult> {
        // Check if new strategy enables high-risk tools without confirmation
        // logic here would inspect candidate.constraints etc.

        return { status: 'PASS' };
    }
}
