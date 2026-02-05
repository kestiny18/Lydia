import { EventEmitter } from 'node:events';
import type { ILLMProvider } from '../llm/index.js';
import {
  type Task,
  type Step,
  type AgentContext,
  TaskStatusSchema,
  IntentAnalyzer,
  SimplePlanner
} from '../strategy/index.js';

export class Agent extends EventEmitter {
  private llm: ILLMProvider;
  private intentAnalyzer: IntentAnalyzer;
  private planner: SimplePlanner;

  // Minimal tool registry for MVP
  private tools: Record<string, (args: any) => Promise<string>> = {
    'shell': async (args) => `[Mock Shell] Executing: ${args.command}`,
    'file_read': async (args) => `[Mock Read] Reading: ${args.path}`,
    'file_write': async (args) => `[Mock Write] Writing to ${args.path}: ${args.content?.slice(0, 20)}...`
  };

  constructor(llm: ILLMProvider) {
    super();
    this.llm = llm;
    this.intentAnalyzer = new IntentAnalyzer(llm);
    this.planner = new SimplePlanner(llm);
  }

  async run(userInput: string): Promise<Task> {
    // 1. Initialize Task
    const task: Task = {
      id: `task-${Date.now()}`,
      description: userInput,
      createdAt: Date.now(),
      status: 'running',
    };

    const context: AgentContext = {
      taskId: task.id,
      history: [],
      state: {},
    };

    this.emit('task:start', task);

    try {
      // 2. Analyze Intent
      this.emit('phase:start', 'intent');
      const intent = await this.intentAnalyzer.analyze(userInput);
      this.emit('intent', intent);
      this.emit('phase:end', 'intent');

      // 3. Generate Plan
      this.emit('phase:start', 'planning');
      const steps = await this.planner.createPlan(task, intent, context);
      this.emit('plan', steps);
      this.emit('phase:end', 'planning');

      // 4. Execution Loop
      this.emit('phase:start', 'execution');

      for (const step of steps) {
        if (task.status !== 'running') break;

        await this.executeStep(step, context);
      }

      this.emit('phase:end', 'execution');

      // Complete Task
      task.status = 'completed';
      task.result = 'All steps executed successfully.';
      this.emit('task:complete', task);

    } catch (error) {
      task.status = 'failed';
      task.result = error instanceof Error ? error.message : String(error);
      this.emit('task:error', error);
    }

    return task;
  }

  private async executeStep(step: Step, context: AgentContext): Promise<void> {
    step.status = 'running';
    step.startedAt = Date.now();
    this.emit('step:start', step);

    try {
      if (step.type === 'action' && step.tool) {
        const toolFn = this.tools[step.tool];
        if (toolFn) {
          step.result = await toolFn(step.args);
        } else {
          step.result = `Tool '${step.tool}' not found (Mock execution)`;
        }
      } else {
        // Thought step - just simulate a pause or processing
        step.result = 'Thought processed.';
      }

      step.status = 'completed';
    } catch (error) {
      step.status = 'failed';
      step.error = error instanceof Error ? error.message : String(error);
      throw error; // Stop execution on failure for now
    } finally {
      step.completedAt = Date.now();
      this.emit('step:complete', step);
    }
  }
}
