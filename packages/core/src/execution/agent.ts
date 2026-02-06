import { EventEmitter } from 'node:events';
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { ILLMProvider } from '../llm/index.js';
import {
  type Task,
  type Step,
  type AgentContext,
  TaskStatusSchema,
  IntentAnalyzer,
  SimplePlanner
} from '../strategy/index.js';
import { McpClientManager, ShellServer, FileSystemServer } from '../mcp/index.js';

export class Agent extends EventEmitter {
  private llm: ILLMProvider;
  private intentAnalyzer: IntentAnalyzer;
  private planner: SimplePlanner;
  private mcpClientManager: McpClientManager;
  private isInitialized = false;

  constructor(llm: ILLMProvider) {
    super();
    this.llm = llm;
    this.intentAnalyzer = new IntentAnalyzer(llm);
    this.planner = new SimplePlanner(llm);
    this.mcpClientManager = new McpClientManager();
  }

  async init() {
    if (this.isInitialized) return;

    // 1. Initialize Built-in Servers
    const shellServer = new ShellServer();
    const fsServer = new FileSystemServer();

    // 2. Connect Shell Server
    const [shellClientTransport, shellServerTransport] = InMemoryTransport.createLinkedPair();
    await shellServer.server.connect(shellServerTransport);
    await this.mcpClientManager.connect({
      id: 'internal-shell',
      type: 'in-memory',
      transport: shellClientTransport
    });

    // 3. Connect FS Server
    const [fsClientTransport, fsServerTransport] = InMemoryTransport.createLinkedPair();
    await fsServer.server.connect(fsServerTransport);
    await this.mcpClientManager.connect({
      id: 'internal-fs',
      type: 'in-memory',
      transport: fsClientTransport
    });

    this.isInitialized = true;
  }

  async run(userInput: string): Promise<Task> {
    await this.init();

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
        try {
          // Use MCP Client Manager to call tool
          const result = await this.mcpClientManager.callTool(step.tool, step.args || {});

          // Flatten MCP result content to string for MVP
          const textContent = result.content
            .filter((c: any) => c.type === 'text')
            .map((c: any) => c.text)
            .join('\n');

          step.result = textContent;
        } catch (error) {
          step.result = `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`;
          throw error;
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
