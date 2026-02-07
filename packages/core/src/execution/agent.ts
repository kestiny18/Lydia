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
import { SkillRegistry, SkillLoader } from '../skills/index.js';
import { McpClientManager, ShellServer, FileSystemServer, GitServer, MemoryServer } from '../mcp/index.js';
import { ConfigLoader } from '../config/index.js';
import { MemoryManager, type Trace } from '../memory/index.js';
import { InteractionServer } from '../mcp/servers/interaction.js';
import { assessRisk, type RiskAssessment } from '../gate/index.js';
import * as path from 'node:path';
import * as os from 'node:os';
import type { LydiaConfig } from '../config/index.js';

export class Agent extends EventEmitter {
  private llm: ILLMProvider;
  private intentAnalyzer: IntentAnalyzer;
  private planner: SimplePlanner;
  private mcpClientManager: McpClientManager;
  private skillRegistry: SkillRegistry;
  private skillLoader: SkillLoader;
  private configLoader: ConfigLoader;
  private memoryManager!: MemoryManager;
  private interactionServer?: InteractionServer;
  private config?: LydiaConfig;
  private isInitialized = false;
  private traces: Trace[] = [];
  private taskApprovals: Set<string> = new Set();

  constructor(llm: ILLMProvider) {
    super();
    this.llm = llm;
    this.intentAnalyzer = new IntentAnalyzer(llm);
    this.planner = new SimplePlanner(llm);
    this.mcpClientManager = new McpClientManager();
    this.skillRegistry = new SkillRegistry();
    this.skillLoader = new SkillLoader(this.skillRegistry);
    this.configLoader = new ConfigLoader();
  }

  async init() {
    if (this.isInitialized) return;

    // 0. Load Configuration
    const config = await this.configLoader.load();
    this.config = config;

    // 0.5 Initialize Memory
    const dbPath = path.join(os.homedir(), '.lydia', 'memory.db');
    // Ensure .lydia dir exists (handled by MemoryManager internal DB creation usually, or assume parent exists)
    // MemoryManager will create file, but better check parent dir in loader or here.
    // ConfigLoader already ensures .lydia exists.
    this.memoryManager = new MemoryManager(dbPath);
    const memoryServer = new MemoryServer(this.memoryManager);

    // Connect Memory Server
    const [memClientTransport, memServerTransport] = InMemoryTransport.createLinkedPair();
    await memoryServer.server.connect(memServerTransport);
    await this.mcpClientManager.connect({
      id: 'internal-memory',
      type: 'in-memory',
      transport: memClientTransport
    });

    // 0.6 Interaction Server (ask_user)
    this.interactionServer = new InteractionServer();
    this.interactionServer.on('request', (req) => this.emit('interaction_request', req));
    const [interactionClientTransport, interactionServerTransport] = InMemoryTransport.createLinkedPair();
    await this.interactionServer.server.connect(interactionServerTransport);
    await this.mcpClientManager.connect({
      id: 'internal-interaction',
      type: 'in-memory',
      transport: interactionClientTransport
    });

    // 1. Load Skills
    await this.skillLoader.loadAll();

    // 2. Initialize Built-in Servers
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

    // 4. Connect Git Server
    const gitServer = new GitServer();
    const [gitClientTransport, gitServerTransport] = InMemoryTransport.createLinkedPair();
    await gitServer.server.connect(gitServerTransport);
    await this.mcpClientManager.connect({
      id: 'internal-git',
      type: 'in-memory',
      transport: gitClientTransport
    });

    // 5. Connect External MCP Servers
    for (const [id, serverConfig] of Object.entries(config.mcpServers)) {
      try {
        await this.mcpClientManager.connect({
          id,
          type: 'stdio',
          command: serverConfig.command,
          args: serverConfig.args,
          env: serverConfig.env,
        });
        // console.log(`Connected to external MCP server: ${id}`);
      } catch (error) {
        console.warn(`Failed to connect to external MCP server ${id}:`, error);
      }
    }

    this.isInitialized = true;
  }

  async run(userInput: string): Promise<Task> {
    await this.init();
    this.taskApprovals = new Set();

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
      state: {
        cwd: process.cwd(),
        lastResult: ''
      },
    };

    this.emit('task:start', task);
    this.traces = []; // Reset traces

    try {
      // 2. Analyze Intent
      this.emit('phase:start', 'intent');
      const intent = await this.intentAnalyzer.analyze(userInput);
      this.emit('intent', intent);
      this.emit('phase:end', 'intent');

      // 2.5 Find Relevant Skills
      // Basic matching for now using summary or raw input
      const matchedSkills = this.skillRegistry.match(userInput + ' ' + intent.summary);
      if (matchedSkills.length > 0) {
        // console.log('Matched skills:', matchedSkills.map(s => s.name));
      }

      // 2.6 Retrieve Memories
      this.emit('phase:start', 'memory');
      const facts = this.memoryManager.searchFacts(userInput);
      const episodes = this.memoryManager.recallEpisodes(userInput);
      this.emit('phase:end', 'memory');

      // 3. Generate Plan
      this.emit('phase:start', 'planning');
      const steps = await this.planner.createPlan(task, intent, context, matchedSkills, { facts, episodes });
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

      // Save Episode and Traces
      const episodeId = this.memoryManager.recordEpisode({
        input: userInput,
        plan: JSON.stringify(steps),
        result: task.result,
        created_at: Date.now()
      });

      this.memoryManager.recordTraces(episodeId, this.traces);

      this.emit('task:complete', task);

    } catch (error) {
      task.status = 'failed';
      task.result = error instanceof Error ? error.message : String(error);
      this.emit('task:error', error);
    }

    return task;
  }

  public resolveInteraction(id: string, response: string): boolean {
    if (!this.interactionServer) return false;
    return this.interactionServer.resolve(id, response);
  }

  private buildApprovalKey(signature: string): string {
    return `risk_approval:${signature}`;
  }

  private getApprovalRecord(signature: string) {
    const key = this.buildApprovalKey(signature);
    return this.memoryManager.getFactByKey(key);
  }

  private recordApprovalPersistent(signature: string, content: string, tags: string[]) {
    if (!this.config?.safety?.rememberApprovals) return;
    const key = this.buildApprovalKey(signature);
    this.memoryManager.rememberFact(content, key, tags);
  }

  private recordApprovalHistory(content: string, tags: string[]) {
    if (!this.config?.safety?.rememberApprovals) return;
    this.memoryManager.rememberFact(content, undefined, tags);
  }

  private async confirmRisk(risk: RiskAssessment, toolName: string): Promise<boolean> {
    if (!risk.signature) return true;
    if (this.taskApprovals.has(risk.signature)) return true;
    const existing = this.getApprovalRecord(risk.signature);
    if (existing) return true;
    if (!this.mcpClientManager.getToolInfo('ask_user')) return true;

    const reason = risk.reason || 'High risk action';
    const details = risk.details ? `\nDetails: ${risk.details}` : '';
    const prompt = `${reason}.\nTool: ${toolName}${details}\n\nOptions: yes, no, always.\n- yes: allow this action for the current task only\n- always: remember and allow in future\n\nYour choice:`;

    const result = await this.mcpClientManager.callTool('ask_user', { prompt });
    const textContent = result.content
      .filter((c: any) => c.type === 'text')
      .map((c: any) => c.text)
      .join('\n')
      .trim()
      .toLowerCase();

    const approved = textContent === 'yes' || textContent === 'y' || textContent === 'always' || textContent === 'a';

    if (approved) {
      const safeReason = reason.replace(/\s+/g, '_').toLowerCase();
      const content = `Approved: ${reason} (tool: ${toolName})`;
      const tags = [
        'risk_approval',
        `tool:${toolName}`,
        `reason:${safeReason}`,
        `signature:${risk.signature}`,
      ];

      if (textContent === 'always' || textContent === 'a') {
        this.recordApprovalPersistent(risk.signature, content, [...tags, 'scope:persistent']);
      } else {
        this.taskApprovals.add(risk.signature);
        this.recordApprovalHistory(content, [...tags, 'scope:task']);
      }
    }

    return approved;
  }

  private resolveArgs(args: any, context: AgentContext): any {
    if (!args) return args;
    const state = context.state || {};

    // Handle string substitution
    if (typeof args === 'string') {
      return args.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
        const val = state[key.trim()];
        return val !== undefined ? String(val) : `{{${key}}}`;
      });
    }

    // Handle arrays
    if (Array.isArray(args)) {
      return args.map(item => this.resolveArgs(item, context));
    }

    // Handle objects
    if (typeof args === 'object') {
      const result: any = {};
      for (const key in args) {
        result[key] = this.resolveArgs(args[key], context);
      }
      return result;
    }

    return args;
  }

  private async executeStep(step: Step, context: AgentContext): Promise<void> {
    step.status = 'running';
    step.startedAt = Date.now();
    this.emit('step:start', step);

    const stepIndex = this.traces.length; // Use current trace count as step index

    try {
      if (step.type === 'action' && step.tool) {
        try {
          // Resolve arguments with context state
          const resolvedArgs = this.resolveArgs(step.args, context);

          const risk = assessRisk(step.tool, resolvedArgs, this.mcpClientManager, this.config);
          if (risk.level === 'high') {
            const approved = await this.confirmRisk(risk, step.tool);
            if (!approved) {
              throw new Error('User denied high-risk action');
            }
          }

          // Log if args were modified (debug info)
          if (JSON.stringify(resolvedArgs) !== JSON.stringify(step.args)) {
             // We could emit a debug event here, but for now let's just use the resolved args
          }

          const start = Date.now();
          // Use MCP Client Manager to call tool
          const result = await this.mcpClientManager.callTool(step.tool, resolvedArgs || {});
          const duration = Date.now() - start;

          // Flatten MCP result content to string for MVP
          const textContent = result.content
            .filter((c: any) => c.type === 'text')
            .map((c: any) => c.text)
            .join('\n');

          step.result = textContent;

          // Record Trace
          this.traces.push({
            step_index: stepIndex,
            tool_name: step.tool,
            tool_args: JSON.stringify(resolvedArgs || {}),
            tool_output: JSON.stringify(result), // Store full MCP result
            duration,
            status: 'success'
          });

          // Update context state
          context.state.lastResult = textContent.trim();
        } catch (error: any) {
          step.result = `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`;

          // Record Failed Trace
          this.traces.push({
            step_index: stepIndex,
            tool_name: step.tool,
            tool_args: JSON.stringify(this.resolveArgs(step.args, context) || {}),
            tool_output: error.message,
            duration: 0,
            status: 'failed'
          });

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
