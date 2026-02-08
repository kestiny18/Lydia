import { Task } from '../strategy/types.js';
import { Strategy } from '../strategy/strategy.js';

export interface EvaluationResult {
    taskId: string;
    success: boolean;
    score: number; // 0-1
    metrics: {
        duration: number;
        steps: number;
        cost?: number;
        driftDetected: boolean;
    };
    details?: string;
}

export interface EvaluationSummary {
    tasks: number;
    successRate: number;
    averageScore: number;
    averageDuration: number;
    driftRate: number;
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
        driftRate: number;
    };
}

export class StrategyEvaluator {

    evaluateTask(task: Task, originalResult: string | undefined): EvaluationResult {
        // Basic evaluation logic
        const success = task.status === 'completed';
        let score = success ? 1.0 : 0.0;

        // Penalize for errors or drift
        if (task.status === 'failed') score = 0;

        // Simple similarity check with original result if available (optional)
        // For now, just success/fail

        return {
            taskId: task.id,
            success,
            score,
            metrics: {
                duration: 0, // Needs real duration from somewhere
                steps: 0, // Needs step count
                driftDetected: false
            },
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
                driftRate: candidateSummary.driftRate - baselineSummary.driftRate
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
            return { tasks: 0, successRate: 0, averageScore: 0, averageDuration: 0, driftRate: 0 };
        }
        const tasks = results.length;
        const successCount = results.filter(r => r.success).length;
        const avgScore = this.calculateAverageScore(results);
        const avgDuration = results.reduce((acc, r) => acc + (r.metrics?.duration || 0), 0) / tasks;
        const driftCount = results.filter(r => r.metrics?.driftDetected).length;

        return {
            tasks,
            successRate: successCount / tasks,
            averageScore: avgScore,
            averageDuration: avgDuration,
            driftRate: driftCount / tasks
        };
    }
}
