import { Task } from '../strategy/types.js';

export interface EvaluationMetrics {
    duration: number;
    steps: number;
    cost?: number;
    driftDetected: boolean;
    riskEvents: number;
    humanInterrupts: number;
}

export interface EvaluationResult {
    taskId: string;
    success: boolean;
    score: number; // 0-1
    metrics: EvaluationMetrics;
    details?: string;
}

export interface EvaluationSummary {
    tasks: number;
    successRate: number;
    averageScore: number;
    averageDuration: number;
    averageCost: number;
    driftRate: number;
    averageRiskEvents: number;
    averageHumanInterrupts: number;
}

export interface StrategyComparison {
    baselineId: string;
    candidateId: string;
    tasksEvaluated: number;
    baselineScore: number;
    candidateScore: number;
    improvement: number; // Percentage
    details: EvaluationResult[];
    baselineSummary: EvaluationSummary;
    candidateSummary: EvaluationSummary;
    delta: {
        successRate: number;
        averageScore: number;
        averageDuration: number;
        averageCost: number;
        driftRate: number;
        averageRiskEvents: number;
        averageHumanInterrupts: number;
    };
}

export class StrategyEvaluator {

    evaluateTask(
        task: Task,
        originalResult: string | undefined,
        runtimeMetrics: Partial<EvaluationMetrics> = {}
    ): EvaluationResult {
        const success = task.status === 'completed';
        const metrics: EvaluationMetrics = {
            duration: runtimeMetrics.duration ?? 0,
            steps: runtimeMetrics.steps ?? 0,
            cost: runtimeMetrics.cost,
            driftDetected: runtimeMetrics.driftDetected ?? false,
            riskEvents: runtimeMetrics.riskEvents ?? 0,
            humanInterrupts: runtimeMetrics.humanInterrupts ?? 0,
        };
        const similarity = this.computeTextSimilarity(task.result || '', originalResult || '');
        const score = this.computeScore(success, similarity, metrics);

        return {
            taskId: task.id,
            success,
            score,
            metrics,
            details: task.result
        };
    }

    compareResults(baseline: EvaluationResult[], candidate: EvaluationResult[]): StrategyComparison {
        const baselineScore = this.calculateAverageScore(baseline);
        const candidateScore = this.calculateAverageScore(candidate);
        const baselineSummary = this.summarize(baseline);
        const candidateSummary = this.summarize(candidate);

        return {
            baselineId: 'baseline',
            candidateId: 'candidate',
            tasksEvaluated: baseline.length,
            baselineScore,
            candidateScore,
            improvement: (candidateScore - baselineScore) / (baselineScore || 1), // Avoid div by zero
            details: candidate,
            baselineSummary,
            candidateSummary,
            delta: {
                successRate: candidateSummary.successRate - baselineSummary.successRate,
                averageScore: candidateSummary.averageScore - baselineSummary.averageScore,
                averageDuration: candidateSummary.averageDuration - baselineSummary.averageDuration,
                averageCost: candidateSummary.averageCost - baselineSummary.averageCost,
                driftRate: candidateSummary.driftRate - baselineSummary.driftRate,
                averageRiskEvents: candidateSummary.averageRiskEvents - baselineSummary.averageRiskEvents,
                averageHumanInterrupts: candidateSummary.averageHumanInterrupts - baselineSummary.averageHumanInterrupts
            }
        };
    }

    private calculateAverageScore(results: EvaluationResult[]): number {
        if (results.length === 0) return 0;
        const sum = results.reduce((acc, r) => acc + r.score, 0);
        return sum / results.length;
    }

    summarize(results: EvaluationResult[]): EvaluationSummary {
        if (results.length === 0) {
            return {
                tasks: 0,
                successRate: 0,
                averageScore: 0,
                averageDuration: 0,
                averageCost: 0,
                driftRate: 0,
                averageRiskEvents: 0,
                averageHumanInterrupts: 0
            };
        }
        const tasks = results.length;
        const successCount = results.filter(r => r.success).length;
        const avgScore = this.calculateAverageScore(results);
        const avgDuration = results.reduce((acc, r) => acc + (r.metrics?.duration || 0), 0) / tasks;
        const avgCost = results.reduce((acc, r) => acc + (r.metrics?.cost || 0), 0) / tasks;
        const driftCount = results.filter(r => r.metrics?.driftDetected).length;
        const avgRiskEvents = results.reduce((acc, r) => acc + (r.metrics?.riskEvents || 0), 0) / tasks;
        const avgHumanInterrupts = results.reduce((acc, r) => acc + (r.metrics?.humanInterrupts || 0), 0) / tasks;

        return {
            tasks,
            successRate: successCount / tasks,
            averageScore: avgScore,
            averageDuration: avgDuration,
            averageCost: avgCost,
            driftRate: driftCount / tasks,
            averageRiskEvents: avgRiskEvents,
            averageHumanInterrupts: avgHumanInterrupts
        };
    }

    private computeScore(success: boolean, similarity: number, metrics: EvaluationMetrics): number {
        if (!success) {
            const failedScore = (0.1 * similarity) - (metrics.driftDetected ? 0.05 : 0);
            return this.clamp01(failedScore);
        }

        const durationScore = this.lowerIsBetter(metrics.duration, 2000, 60000);
        const stepsScore = this.lowerIsBetter(metrics.steps, 3, 20);
        const costScore = typeof metrics.cost === 'number'
            ? this.lowerIsBetter(metrics.cost, 1000, 50000)
            : 0.5;
        const riskScore = this.lowerIsBetter(metrics.riskEvents, 0, 5);
        const humanScore = this.lowerIsBetter(metrics.humanInterrupts, 0, 5);
        const driftPenalty = metrics.driftDetected ? 0.15 : 0;

        const weighted =
            0.45 +
            0.15 * similarity +
            0.15 * durationScore +
            0.10 * stepsScore +
            0.05 * costScore +
            0.05 * riskScore +
            0.05 * humanScore -
            driftPenalty;

        return this.clamp01(weighted);
    }

    private computeTextSimilarity(actual: string, expected: string): number {
        const a = this.tokenize(actual);
        const b = this.tokenize(expected);
        if (a.size === 0 && b.size === 0) return 1;
        if (a.size === 0 || b.size === 0) return 0.5;

        let intersection = 0;
        for (const token of a) {
            if (b.has(token)) intersection += 1;
        }
        const union = new Set([...a, ...b]).size;
        if (union === 0) return 0.5;
        return intersection / union;
    }

    private tokenize(text: string): Set<string> {
        const normalized = text
            .toLowerCase()
            .replace(/[^\p{L}\p{N}\s]/gu, ' ')
            .split(/\s+/)
            .map((token) => token.trim())
            .filter((token) => token.length >= 2);
        return new Set(normalized);
    }

    private lowerIsBetter(value: number, best: number, worst: number): number {
        if (value <= best) return 1;
        if (value >= worst) return 0;
        const ratio = (value - best) / (worst - best);
        return 1 - ratio;
    }

    private clamp01(value: number): number {
        if (value < 0) return 0;
        if (value > 1) return 1;
        return value;
    }
}
