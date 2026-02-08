import { describe, it, expect } from 'vitest';
import { TaskReporter } from './reporter.js';
import { MemoryManager } from '../memory/manager.js';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';

describe('TaskReporter integration', () => {
  it('records task reports in memory', () => {
    const dbPath = path.join(os.tmpdir(), `lydia-task-report-${Date.now()}.db`);
    const memory = new MemoryManager(dbPath);
    const reporter = new TaskReporter();

    const task = {
      id: 'task-1',
      description: 'Test task',
      createdAt: Date.now(),
      status: 'completed' as const,
      result: 'ok',
    };

    const intent = {
      category: 'action' as const,
      summary: 'Test task',
      entities: [],
      complexity: 'simple' as const,
      goal: 'Complete test task',
      deliverables: ['result'],
      constraints: [],
      successCriteria: ['task completes'],
      assumptions: [],
      requiredTools: []
    };

    const results = [
      { stepId: 'step-1', status: 'completed' as const, output: 'done' }
    ];

    const report = reporter.generateReport(task as any, intent as any, results);
    const id = memory.recordTaskReport(task.id, report);
    expect(id).toBeGreaterThan(0);

    const reports = memory.listTaskReports(10);
    expect(reports.length).toBeGreaterThan(0);

    try {
      fs.rmSync(dbPath, { force: true });
    } catch {
      // ignore cleanup errors
    }
  });
});
