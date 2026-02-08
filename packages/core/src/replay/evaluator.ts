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

export interface StrategyComparison {
    baselineId: string;
    candidateId: string;
    tasksEvaluated: number;
    baselineScore: number;
    candidateScore: number;
    improvement: number; // Percentage
    details: EvaluationResult[];
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

        return {
            baselineId: 'baseline',
            candidateId: 'candidate',
            tasksEvaluated: baseline.length,
            baselineScore,
            candidateScore,
            improvement: (candidateScore - baselineScore) / (baselineScore || 1), // Avoid div by zero
            details: candidate
        };
    }

    private calculateAverageScore(results: EvaluationResult[]): number {
        if (results.length === 0) return 0;
        const sum = results.reduce((acc, r) => acc + r.score, 0);
        return sum / results.length;
    }
}
