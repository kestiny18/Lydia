import { describe, expect, it } from 'vitest';
import { StrategyEvaluator, type EvaluationResult } from './evaluator.js';
import type { Task } from '../strategy/types.js';

function createTask(status: Task['status'], result: string, id = 'task-1'): Task {
  return {
    id,
    description: 'test',
    createdAt: Date.now(),
    status,
    result,
  };
}

describe('StrategyEvaluator', () => {
  it('scores successful low-risk fast execution higher than slow drifted execution', () => {
    const evaluator = new StrategyEvaluator();
    const baselineText = 'updated file and verified output';

    const strong = evaluator.evaluateTask(
      createTask('completed', 'updated file and verified output', 'task-strong'),
      baselineText,
      {
        duration: 1200,
        steps: 3,
        driftDetected: false,
        riskEvents: 0,
        humanInterrupts: 0,
      }
    );

    const weak = evaluator.evaluateTask(
      createTask('completed', 'finished with many retries', 'task-weak'),
      baselineText,
      {
        duration: 45000,
        steps: 16,
        driftDetected: true,
        riskEvents: 4,
        humanInterrupts: 3,
      }
    );

    expect(strong.score).toBeGreaterThan(weak.score);
  });

  it('keeps failed executions low-scored even with partial textual similarity', () => {
    const evaluator = new StrategyEvaluator();
    const success = evaluator.evaluateTask(
      createTask('completed', 'task done and validated'),
      'task done and validated',
      { duration: 1500, steps: 2, driftDetected: false, riskEvents: 0, humanInterrupts: 0 }
    );
    const failure = evaluator.evaluateTask(
      createTask('failed', 'task done but crashed before completion'),
      'task done and validated',
      { duration: 1500, steps: 2, driftDetected: true, riskEvents: 2, humanInterrupts: 1 }
    );

    expect(success.score).toBeGreaterThan(failure.score);
    expect(failure.score).toBeLessThan(0.2);
  });

  it('summarizes extended metrics', () => {
    const evaluator = new StrategyEvaluator();
    const results: EvaluationResult[] = [
      evaluator.evaluateTask(createTask('completed', 'ok', 'a'), 'ok', {
        duration: 1000,
        steps: 2,
        cost: 100,
        driftDetected: false,
        riskEvents: 1,
        humanInterrupts: 0,
      }),
      evaluator.evaluateTask(createTask('completed', 'ok', 'b'), 'ok', {
        duration: 3000,
        steps: 4,
        cost: 300,
        driftDetected: true,
        riskEvents: 3,
        humanInterrupts: 2,
      }),
    ];

    const summary = evaluator.summarize(results);
    expect(summary.tasks).toBe(2);
    expect(summary.averageDuration).toBe(2000);
    expect(summary.averageCost).toBe(200);
    expect(summary.averageRiskEvents).toBe(2);
    expect(summary.averageHumanInterrupts).toBe(1);
    expect(summary.driftRate).toBe(0.5);
  });
});

