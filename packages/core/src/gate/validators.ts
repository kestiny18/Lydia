import { Strategy, StrategySchema } from '../strategy/strategy.js';
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
        evaluations?: EvaluationResult[],
        baseline?: Strategy
    ): Promise<ValidationResult>;
}

const HIGH_RISK_TOOLS = new Set([
    'shell_execute',
    'fs_write_file',
    'fs_delete_file',
    'fs_delete_directory',
    'fs_move',
    'fs_copy',
    'git_push'
]);

const DEFAULT_PREFERENCES = {
    riskTolerance: 0.1,
    userConfirmation: 0.8,
    autonomyLevel: 'assisted' as const
};

function normalizePreferences(strategy: Strategy | undefined) {
    return {
        riskTolerance: strategy?.preferences?.riskTolerance ?? DEFAULT_PREFERENCES.riskTolerance,
        userConfirmation: strategy?.preferences?.userConfirmation ?? DEFAULT_PREFERENCES.userConfirmation,
        autonomyLevel: strategy?.preferences?.autonomyLevel ?? DEFAULT_PREFERENCES.autonomyLevel
    };
}

function autonomyRank(level: string): number {
    if (level === 'manual') return 0;
    if (level === 'assisted') return 1;
    if (level === 'autonomous') return 2;
    return 1;
}

function collectConfirmations(strategy: Strategy | undefined): Set<string> {
    const mustConfirm = strategy?.constraints?.mustConfirmBefore ?? [];
    const requiresConfirmation = strategy?.execution?.requiresConfirmation ?? [];
    return new Set([...mustConfirm, ...requiresConfirmation]);
}

function collectDeniedTools(strategy: Strategy | undefined): Set<string> {
    return new Set(strategy?.constraints?.deniedTools ?? []);
}

export class SyntaxValidator implements GateValidator {
    name = 'syntax_validator';
    async validate(candidate: Strategy): Promise<ValidationResult> {
        const parsed = StrategySchema.safeParse(candidate);
        if (!parsed.success) {
            return { status: 'REJECT', reason: 'Strategy schema validation failed', details: parsed.error.flatten() };
        }
        if (!candidate.metadata.id) return { status: 'REJECT', reason: 'Missing metadata.id' };
        if (!candidate.metadata.version) return { status: 'REJECT', reason: 'Missing metadata.version' };
        return { status: 'PASS' };
    }
}

export class EvolutionLimitValidator implements GateValidator {
    name = 'evolution_limit_validator';
    async validate(candidate: Strategy, _branch: StrategyBranch, _evaluations?: EvaluationResult[], baseline?: Strategy): Promise<ValidationResult> {
        const maxIncrease = candidate.evolution_limits?.maxAutonomyIncrease ?? 0.1;
        const candidatePrefs = normalizePreferences(candidate);

        if (baseline) {
            const basePrefs = normalizePreferences(baseline);
            const riskDelta = candidatePrefs.riskTolerance - basePrefs.riskTolerance;
            const confirmDelta = basePrefs.userConfirmation - candidatePrefs.userConfirmation;
            const autonomyDelta = autonomyRank(candidatePrefs.autonomyLevel) - autonomyRank(basePrefs.autonomyLevel);

            if (riskDelta > maxIncrease) {
                return { status: 'REJECT', reason: `riskTolerance increase ${riskDelta.toFixed(2)} exceeds limit ${maxIncrease.toFixed(2)}` };
            }
            if (confirmDelta > maxIncrease) {
                return { status: 'REJECT', reason: `userConfirmation decrease ${confirmDelta.toFixed(2)} exceeds limit ${maxIncrease.toFixed(2)}` };
            }
            if (autonomyDelta >= 2) {
                return { status: 'REJECT', reason: 'autonomyLevel jump is too large' };
            }
            if (autonomyDelta === 1) {
                return { status: 'NEEDS_HUMAN', reason: 'autonomyLevel increase requires review' };
            }
        } else {
            if (candidatePrefs.riskTolerance > 0.7 || candidatePrefs.userConfirmation < 0.3) {
                return { status: 'NEEDS_HUMAN', reason: 'High-risk preference settings without baseline comparison' };
            }
            if (candidatePrefs.autonomyLevel === 'autonomous') {
                return { status: 'NEEDS_HUMAN', reason: 'Autonomous mode requires review without baseline' };
            }
        }

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
        const averageScore = evaluations.reduce((acc, cur) => acc + (cur.score || 0), 0) / evaluations.length;
        const driftCount = evaluations.filter(e => e.metrics?.driftDetected).length;

        if (failureRate > 0.2) {
            return { status: 'REJECT', reason: `High failure rate: ${(failureRate * 100).toFixed(1)}%` };
        }

        if (averageScore < 0.7) {
            return { status: 'REJECT', reason: `Low average score: ${(averageScore * 100).toFixed(1)}%` };
        }

        if (driftCount > 0) {
            return { status: 'NEEDS_HUMAN', reason: `Replay drift detected in ${driftCount} episode(s)` };
        }

        return { status: 'PASS' };
    }
}

export class RiskSafetyValidator implements GateValidator {
    name = 'risk_safety_validator';
    async validate(candidate: Strategy, _branch: StrategyBranch, _evaluations?: EvaluationResult[], baseline?: Strategy): Promise<ValidationResult> {
        const candidateConfirmations = collectConfirmations(candidate);
        const candidateDenied = collectDeniedTools(candidate);
        const baselineConfirmations = collectConfirmations(baseline);
        const baselineDenied = collectDeniedTools(baseline);

        const removedConfirmations = Array.from(baselineConfirmations).filter(t => !candidateConfirmations.has(t));
        const removedDenied = Array.from(baselineDenied).filter(t => !candidateDenied.has(t));

        const removedHighRiskConfirmations = removedConfirmations.filter(t => HIGH_RISK_TOOLS.has(t));
        const removedHighRiskDenied = removedDenied.filter(t => HIGH_RISK_TOOLS.has(t));

        if (removedHighRiskDenied.length > 0) {
            return {
                status: 'REJECT',
                reason: `Removed denied tools: ${removedHighRiskDenied.join(', ')}`
            };
        }

        if (removedConfirmations.length > 0 || removedDenied.length > 0) {
            return {
                status: 'NEEDS_HUMAN',
                reason: `Reduced safety constraints: confirmations removed (${removedConfirmations.join(', ') || 'none'}), denied tools removed (${removedDenied.join(', ') || 'none'})`
            };
        }

        if (candidate.execution?.riskTolerance === 'high') {
            const missing = Array.from(HIGH_RISK_TOOLS).filter(t => !candidateConfirmations.has(t));
            if (missing.length > 0) {
                return { status: 'NEEDS_HUMAN', reason: `High risk execution without confirmations for: ${missing.join(', ')}` };
            }
        }

        return { status: 'PASS' };
    }
}
