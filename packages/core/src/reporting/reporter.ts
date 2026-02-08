import type { IntentProfile } from '../strategy/intent.js';
import type { Task } from '../strategy/types.js';

export interface StepResult {
  stepId: string;
  status: 'completed' | 'failed' | 'skipped';
  output?: string;
  error?: string;
  durationMs?: number;
  verificationStatus?: 'pending' | 'passed' | 'failed';
}

export interface ExecutionSummary {
  taskId: string;
  stepsTotal: number;
  stepsCompleted: number;
  stepsFailed: number;
  outputs: string[];
  failures: Array<{ stepId: string; reason: string }>;
  artifacts: Array<{ path: string; description?: string }>;
}

export interface TaskReport {
  taskId: string;
  intentSummary: string;
  success: boolean;
  summary: string;
  outputs: string[];
  followUps: string[];
  steps: StepResult[];
  verificationNotes?: string[];
  createdAt: number;
}

export class TaskReporter {
  buildSummary(taskId: string, results: StepResult[]): ExecutionSummary {
    const stepsTotal = results.length;
    const stepsCompleted = results.filter(r => r.status === 'completed').length;
    const stepsFailed = results.filter(r => r.status === 'failed').length;
    const outputs = results
      .map(r => r.output)
      .filter((output): output is string => Boolean(output && output.trim()))
      .map(output => output.trim());

    const failures = results
      .filter(r => r.status === 'failed')
      .map(r => ({
        stepId: r.stepId,
        reason: r.error || 'Unknown failure'
      }));

    return {
      taskId,
      stepsTotal,
      stepsCompleted,
      stepsFailed,
      outputs,
      failures,
      artifacts: []
    };
  }

  generateReport(task: Task, intent: IntentProfile, results: StepResult[]): TaskReport {
    const summary = this.buildSummary(task.id, results);
    const success = summary.stepsFailed === 0;
    const intentSummary = intent.summary || intent.goal || task.description;

    const summaryText = success
      ? `Completed ${summary.stepsCompleted}/${summary.stepsTotal} steps.`
      : `Task failed with ${summary.stepsFailed} failed step(s).`;

    const followUps: string[] = [];
    if (!success) {
      followUps.push('Review failed steps and retry after fixing errors.');
    }
    if (summary.outputs.length === 0) {
      followUps.push('No outputs captured. Consider adding explicit verification steps.');
    }

    return {
      taskId: task.id,
      intentSummary,
      success,
      summary: summaryText,
      outputs: summary.outputs,
      followUps,
      steps: results,
      verificationNotes: summary.failures.map(f => `Failure at ${f.stepId}: ${f.reason}`),
      createdAt: Date.now()
    };
  }
}
