import { describe, it, expect } from 'vitest';
import { SimplePlanner } from './planner.js';

const mockLLM = {
  generate: async () => ({
    id: 'test',
    role: 'assistant',
    model: 'mock',
    stop_reason: 'end_turn',
    usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          steps: [
            {
              type: 'action',
              description: 'List files',
              tool: 'fs_list_directory',
              args: { path: '.' }
            }
          ]
        })
      }
    ]
  })
};

describe('Planner validation', () => {
  it('adds verification and dependencies to action steps', async () => {
    const planner = new SimplePlanner(mockLLM as any, { planning: { temperature: 0 } } as any);
    const steps = await planner.createPlan(
      { id: 'task-1', description: 'List files', createdAt: Date.now(), status: 'running' } as any,
      {
        category: 'action',
        summary: 'List files',
        entities: [],
        complexity: 'simple',
        goal: 'List files',
        deliverables: [],
        constraints: [],
        successCriteria: [],
        assumptions: [],
        requiredTools: []
      } as any,
      { taskId: 'task-1', history: [], state: {} } as any
    );

    expect(steps.length).toBeGreaterThan(0);
    const actionStep = steps.find(step => step.type === 'action');
    expect(actionStep).toBeTruthy();
    expect(actionStep?.verification && actionStep.verification.length > 0).toBe(true);
    expect(actionStep?.dependsOn && actionStep.dependsOn.length > 0).toBe(true);
  });
});
