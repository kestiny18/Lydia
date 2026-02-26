import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Agent } from './agent.js';
import { MockProvider } from '../llm/providers/mock.js';
import { MemoryManager } from '../memory/manager.js';
import { SimplePlanner } from '../strategy/planner.js';

function makeStrategy() {
  return {
    metadata: {
      id: 'test-strategy',
      version: '1.0.0',
      name: 'Test Strategy',
    },
    system: {
      role: 'You are a test agent.',
      goals: [],
      constraints: [],
    },
    prompts: {},
    planning: {
      temperature: 0,
    },
    execution: {
      requiresConfirmation: [],
    },
    preferences: {
      userConfirmation: 0,
    },
    constraints: {
      mustConfirmBefore: [],
      neverSkipReviewFor: [],
      deniedTools: [],
    },
    evolution_limits: {
      maxAutonomyIncrease: 0.1,
      cooldownPeriod: '1 day',
    },
  } as any;
}

function makeAgent(
  provider: MockProvider,
  memory: MemoryManager,
  callTool: (name: string, input: Record<string, unknown>) => Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }>,
): Agent {
  const strategy = makeStrategy();
  const agent = new Agent(provider);
  (agent as any).isInitialized = true;
  (agent as any).memoryManager = memory;
  (agent as any).activeStrategy = strategy;
  (agent as any).planner = new SimplePlanner(provider as any, strategy);
  (agent as any).config = {
    llm: {},
    mcpServers: {},
    strategy: {},
    safety: { rememberApprovals: false },
    skills: { matchTopK: 3, hotReload: false, extraDirs: [] },
    agent: {
      maxIterations: 8,
      intentAnalysis: false,
      failureReplan: true,
      maxRetries: 0,
      retryDelayMs: 0,
      streaming: false,
    },
  };
  (agent as any).mcpClientManager = {
    getToolDefinitions: () => [{
      name: 'shell_execute',
      description: 'execute shell command',
      inputSchema: {
        type: 'object',
        properties: { command: { type: 'string' } },
        required: ['command'],
      },
    }],
    callTool,
    getToolInfo: () => undefined,
    isToolExternal: () => false,
  };
  return agent;
}

describe('Task execution chain integration', () => {
  const dbPaths: string[] = [];

  afterEach(() => {
    for (const dbPath of dbPaths) {
      try {
        fs.rmSync(dbPath, { force: true });
      } catch {
        // ignore cleanup errors
      }
    }
    dbPaths.length = 0;
  });

  it('stores task report with completed step results', async () => {
    const provider = new MockProvider();
    const dbPath = path.join(os.tmpdir(), `lydia-task-chain-success-${Date.now()}.db`);
    dbPaths.push(dbPath);
    const memory = new MemoryManager(dbPath);

    provider.enqueueResponse({
      text: JSON.stringify({
        steps: [
          {
            type: 'action',
            description: 'Check current directory',
            tool: 'shell_execute',
            args: { command: 'pwd' },
            dependsOn: [],
            verification: ['Ensure directory path is returned'],
          },
        ],
      }),
      stop_reason: 'end_turn',
    });
    provider.enqueueResponse({
      id: 'exec-tool',
      role: 'assistant',
      model: 'mock-model',
      stop_reason: 'tool_use',
      usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      content: [
        {
          type: 'tool_use',
          id: 'tool-1',
          name: 'shell_execute',
          input: { command: 'pwd' },
        } as any,
      ],
    });
    provider.enqueueResponse({
      text: 'Current directory checked successfully.',
      stop_reason: 'end_turn',
    });

    const agent = makeAgent(provider, memory, async () => ({
      content: [{ type: 'text', text: '/tmp/project' }],
      isError: false,
    }));
    const task = await agent.run('Check project directory');

    expect(task.status).toBe('completed');
    const reports = memory.listTaskReports(10);
    expect(reports.length).toBeGreaterThan(0);
    const latest = JSON.parse(reports[0].report_json);
    expect(latest.steps.some((s: any) => s.status === 'completed')).toBe(true);
    expect(latest.intentSummary).toContain('Check project directory');
  });

  it('marks downstream steps skipped and records replan step after failure', async () => {
    const provider = new MockProvider();
    const dbPath = path.join(os.tmpdir(), `lydia-task-chain-fail-${Date.now()}.db`);
    dbPaths.push(dbPath);
    const memory = new MemoryManager(dbPath);

    provider.enqueueResponse({
      text: JSON.stringify({
        steps: [
          {
            type: 'action',
            description: 'Run first command',
            tool: 'shell_execute',
            args: { command: 'step-1' },
            dependsOn: [],
            verification: ['Command returns success'],
          },
          {
            type: 'action',
            description: 'Run second command',
            tool: 'shell_execute',
            args: { command: 'step-2' },
            dependsOn: [1],
            verification: ['Second command returns success'],
          },
        ],
      }),
      stop_reason: 'end_turn',
    });
    provider.enqueueResponse({
      id: 'exec-tool-fail',
      role: 'assistant',
      model: 'mock-model',
      stop_reason: 'tool_use',
      usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      content: [
        {
          type: 'tool_use',
          id: 'tool-fail-1',
          name: 'shell_execute',
          input: { command: 'step-1' },
        } as any,
      ],
    });
    provider.enqueueResponse({
      text: 'I will stop here and report failure.',
      stop_reason: 'end_turn',
    });

    const agent = makeAgent(provider, memory, async () => ({
      content: [{ type: 'text', text: 'command failed' }],
      isError: true,
    }));
    await agent.run('Execute two dependent commands');

    const reports = memory.listTaskReports(10);
    expect(reports.length).toBeGreaterThan(0);
    const latest = JSON.parse(reports[0].report_json);
    expect(latest.success).toBe(false);
    expect(latest.steps.some((s: any) => s.status === 'failed')).toBe(true);
    expect(latest.steps.some((s: any) => s.status === 'skipped')).toBe(true);
    expect(latest.steps.some((s: any) => String(s.stepId).startsWith('replan-'))).toBe(true);
  });
});
