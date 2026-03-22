import { EventEmitter } from 'node:events';
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type {
  ILLMProvider,
  Message,
  ContentBlock,
  ToolDefinition,
  ToolUseContent,
  LLMRequest,
  LLMResponse,
  StreamChunk,
  TextContent,
  ImageContent
} from '../llm/index.js';
import type { Skill, SkillMeta, DynamicSkill } from '../skills/types.js';
import { isDynamicSkill, hasContent, getSkillContent } from '../skills/types.js';
import {
  type Task,
  type IntentProfile,
  type Step,
  type TaskContext,
  TaskStatusSchema,
  IntentAnalyzer,
  SimplePlanner,
} from '../strategy/index.js';
import { SkillRegistry, SkillLoader } from '../skills/index.js';
import { SkillWatcher } from '../skills/watcher.js';
import { StrategyRegistry, type Strategy } from '../strategy/index.js';
import {
  McpClientManager,
  ShellServer,
  FileSystemServer,
  GitServer,
  MemoryServer,
  BrowserServer,
} from '../mcp/index.js';
import { ConfigLoader } from '../config/index.js';
import { MemoryManager, type Trace, type Fact, type Episode, type Checkpoint } from '../memory/index.js';
import { InteractionServer } from '../mcp/servers/interaction.js';
import { assessRisk, type RiskAssessment, StrategyUpdateGate, ReviewManager } from '../gate/index.js';
import { StrategyBranchManager } from '../strategy/branch-manager.js';
import { SelfEvolutionSkill } from '../skills/self-evolution.js';
import { TaskReporter, type StepResult } from '../reporting/index.js';
import { FeedbackCollector } from '../feedback/index.js';
import {
  resolveCanonicalComputerUseToolName,
  isComputerUseErrorCode,
  McpCanonicalCapabilityAdapter,
  ComputerUseSessionOrchestrator,
  type ComputerUseActionEnvelope,
  type ComputerUseCheckpoint,
  type ComputerUseDomain,
} from '../computer-use/index.js';
import * as path from 'node:path';
import * as os from 'node:os';
import type { LydiaConfig } from '../config/index.js';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';

export interface AgentOptions {
  strategyPathOverride?: string;
}

interface VerificationEvaluation {
  passed: boolean;
  failedCriteria: string[];
}

export class Agent extends EventEmitter {
  private llm: ILLMProvider;
  private intentAnalyzer: IntentAnalyzer;
  private mcpClientManager: McpClientManager;
  private skillRegistry: SkillRegistry;
  private skillLoader: SkillLoader;
  private strategyRegistry: StrategyRegistry;
  private activeStrategy?: Strategy;
  private configLoader: ConfigLoader;
  private memoryManager!: MemoryManager;
  private interactionServer?: InteractionServer;
  private config?: LydiaConfig;
  private isInitialized = false;
  private traces: Trace[] = [];
  private stepResults: StepResult[] = [];
  private taskApprovals: Set<string> = new Set();
  private planner?: SimplePlanner;
  private currentPlan: Step[] = [];
  private executedPlanStepIds: Set<string> = new Set();
  private skippedPlanStepIds: Set<string> = new Set();
  private replannedFailures: Set<string> = new Set();
  private verificationFailureCount = 0;
  private computerUseSessionId?: string;
  private computerUseCheckpoint?: ComputerUseCheckpoint;
  private computerUseActionCounter = 0;

  // Controlled Evolution components
  private branchManager: StrategyBranchManager;
  private reviewManager: ReviewManager;
  private updateGate: StrategyUpdateGate;
  private reporter: TaskReporter;
  private feedbackCollector: FeedbackCollector;

  // Session state for multi-turn conversations (P1-1)
  private sessionMessages: Message[] = [];
  private sessionSystemPrompt: string = '';
  private sessionTools: ToolDefinition[] = [];
  private sessionInitialized = false;

  // DynamicSkill tool routing (P2-1)
  private skillToolMap: Map<string, DynamicSkill> = new Map();

  // Hot-reload watcher for skill files
  private skillWatcher?: SkillWatcher;

  // Checkpoint state — tracks current task context for save/resume
  private currentTaskId?: string;
  private currentRunId?: string;
  private currentInput?: string;
  private currentTaskCreatedAt?: number;

  // Centralized built-in server descriptors keep MCP wiring declarative.
  private builtinServerSpecs: Array<{ id: string; create: () => Server }> = [];
  private browserServer?: BrowserServer;
  private options: AgentOptions;
  private computerUseAdapter: McpCanonicalCapabilityAdapter;
  private computerUseOrchestrator: ComputerUseSessionOrchestrator;

  constructor(llm: ILLMProvider, options: AgentOptions = {}) {
    super();
    this.llm = llm;
    this.options = options;
    this.intentAnalyzer = new IntentAnalyzer(llm);
    this.mcpClientManager = new McpClientManager();
    this.skillRegistry = new SkillRegistry();
    this.skillLoader = new SkillLoader(this.skillRegistry);
    this.strategyRegistry = new StrategyRegistry();
    this.configLoader = new ConfigLoader();

    // Initialize Controlled Evolution components
    this.branchManager = new StrategyBranchManager();
    this.reviewManager = new ReviewManager();
    this.updateGate = new StrategyUpdateGate();
    this.reporter = new TaskReporter();
    this.feedbackCollector = new FeedbackCollector();
    this.computerUseAdapter = new McpCanonicalCapabilityAdapter();
    this.computerUseOrchestrator = new ComputerUseSessionOrchestrator();
    this.bindComputerUseEvents();
  }

  private bindComputerUseEvents(): void {
    this.computerUseOrchestrator.on('session.start', (data) => {
      this.emit('computer-use:session.start', data);
    });
    this.computerUseOrchestrator.on('action.dispatch', (data) => {
      this.emit('computer-use:action.dispatch', data);
    });
    this.computerUseOrchestrator.on('observation.collect', (data) => {
      this.emit('computer-use:observation.collect', data);
    });
    this.computerUseOrchestrator.on('checkpoint.save', (data) => {
      this.emit('computer-use:checkpoint.save', data);
    });
    this.computerUseOrchestrator.on('verification', (data) => {
      this.emit('computer-use:verification', data);
    });
    this.computerUseOrchestrator.on('session.end', (data) => {
      this.emit('computer-use:session.end', data);
    });
  }

  async init() {
    if (this.isInitialized) return;

    // Initialize core structural components
    await this.branchManager.init();
    await this.reviewManager.init();

    // 0. Load Configuration
    const config = await this.configLoader.load();
    this.config = config;

    // 0.5 Initialize Memory
    const dbPath = path.join(os.homedir(), '.lydia', 'memory.db');
    this.memoryManager = new MemoryManager(dbPath, {
      checkpointTtlMs: Math.max(1, config.memory?.checkpointTtlHours ?? 24) * 60 * 60 * 1000,
      observationFrameTtlMs: Math.max(1, config.memory?.observationFrameTtlHours ?? (24 * 7)) * 60 * 60 * 1000,
    });
    this.reviewManager = new ReviewManager(this.memoryManager);

    const memoryServer = new MemoryServer(this.memoryManager);
    await this.connectInMemoryServer('internal-memory', memoryServer.server);

    // 0.6 Interaction Server (ask_user)
    this.interactionServer = new InteractionServer();
    this.interactionServer.on('request', (req) => this.emit('interaction_request', req));
    await this.connectInMemoryServer('internal-interaction', this.interactionServer.server);

    // 1. Load Skills (Phase 1: metadata only for progressive disclosure)
    const extraSkillDirs = config.skills?.extraDirs ?? [];
    await this.skillLoader.loadAll(extraSkillDirs);

    // 1.1 Register System Skills
    const evolutionSkill = new SelfEvolutionSkill(
      this.branchManager,
      this.updateGate,
      this.reviewManager,
      this.strategyRegistry,
      this.memoryManager
    );
    this.skillRegistry.register(evolutionSkill);

    // 1.2 Start hot-reload watcher if enabled
    const enableHotReload = config.skills?.hotReload ?? true;
    if (enableHotReload) {
      const watchDirs = this.skillLoader.getDirectories(extraSkillDirs);
      this.skillWatcher = new SkillWatcher(watchDirs, this.skillRegistry, this.skillLoader);
      this.skillWatcher.on('skill:added', () => this.registerSkillTools());
      this.skillWatcher.on('skill:updated', () => this.registerSkillTools());
      this.skillWatcher.on('skill:removed', () => this.registerSkillTools());
      this.skillWatcher.on('error', (err) => this.emit('skill:error', err));
      this.skillWatcher.start();
    }

    // 1.5 Load Active Strategy
    try {
      const customPath = this.options.strategyPathOverride || this.config?.strategy?.activePath;
      if (customPath) {
        this.activeStrategy = await this.strategyRegistry.loadFromFile(customPath);
        this.strategyRegistry.setActive(this.activeStrategy.metadata.id);
      } else {
        this.activeStrategy = await this.strategyRegistry.loadDefault();
      }
    } catch (error) {
      console.warn('Failed to load default strategy:', error);
    }

    if (!this.activeStrategy) {
      throw new Error("Failed to initialize Agent: No strategy loaded.");
    }
    this.planner = new SimplePlanner(this.llm, this.activeStrategy);

    // 2. Initialize built-in MCP servers (declarative for future capability expansion).
    this.builtinServerSpecs = [
      { id: 'internal-shell', create: () => new ShellServer().server },
      { id: 'internal-fs', create: () => new FileSystemServer().server },
      { id: 'internal-git', create: () => new GitServer().server },
    ];
    if (config.browser?.enabled !== false) {
      this.browserServer = new BrowserServer(config.browser);
      this.builtinServerSpecs.push({
        id: 'internal-browser',
        create: () => this.browserServer!.server,
      });
    }
    await this.connectBuiltinServers();

    // 5. Connect External MCP Servers
    await this.connectExternalMcpServers(config.mcpServers);

    this.isInitialized = true;

    // Register DynamicSkill tools for routing (P2-1)
    this.registerSkillTools();
  }

  // ─── DynamicSkill Tool Registration (P2-1) ─────────────────────────

  private registerSkillTools() {
    this.skillToolMap.clear();
    for (const skill of this.skillRegistry.list()) {
      if (this.isDynamicSkillCheck(skill) && skill.tools) {
        for (const tool of skill.tools) {
          this.skillToolMap.set(tool.name, skill);
        }
      }
    }
  }

  private isDynamicSkillCheck(skill: Skill | SkillMeta): skill is DynamicSkill {
    return isDynamicSkill(skill);
  }

  private async connectInMemoryServer(id: string, server: Server): Promise<void> {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await this.mcpClientManager.connect({
      id,
      type: 'in-memory',
      transport: clientTransport,
    });
  }

  private async connectBuiltinServers(): Promise<void> {
    for (const spec of this.builtinServerSpecs) {
      await this.connectInMemoryServer(spec.id, spec.create());
    }
  }

  private async connectExternalMcpServers(servers: LydiaConfig['mcpServers']): Promise<void> {
    for (const [id, serverConfig] of Object.entries(servers || {})) {
      try {
        await this.mcpClientManager.connect({
          id,
          type: 'stdio',
          command: serverConfig.command,
          args: serverConfig.args,
          env: serverConfig.env,
        });
      } catch (error) {
        console.warn(`Failed to connect to external MCP server ${id}:`, error);
      }
    }
  }

  private getAllToolDefinitions(): ToolDefinition[] {
    const mcpTools = this.mcpClientManager.getToolDefinitions();
    const skillTools: ToolDefinition[] = [];

    for (const skill of this.skillRegistry.list()) {
      if (this.isDynamicSkillCheck(skill) && skill.tools) {
        for (const tool of skill.tools) {
          skillTools.push({
            name: tool.name,
            description: tool.description || '',
            inputSchema: tool.inputSchema as Record<string, unknown>,
          });
        }
      }
    }

    return [...mcpTools, ...skillTools];
  }

  /**
   * Collect allowedTools from matched skills and return a Set for filtering.
   * Returns null if no skill restricts tools (all tools are allowed).
   */
  private getActiveAllowedTools(matchedSkills: (Skill | SkillMeta)[]): Set<string> | null {
    const restrictions: string[] = [];
    for (const skill of matchedSkills) {
      if (skill.allowedTools && skill.allowedTools.length > 0) {
        restrictions.push(...skill.allowedTools);
      }
    }
    // If no skill has restrictions, allow all tools
    if (restrictions.length === 0) return null;
    return new Set(restrictions);
  }

  // ─── Multi-turn Chat (P1-1) ────────────────────────────────────────

  async chat(userMessage: string): Promise<string> {
    await this.init();

    if (!this.sessionInitialized) {
      const topK = this.config?.skills?.matchTopK ?? 3;
      const matchedSkills = this.skillRegistry.match(userMessage, topK);

      // Phase 2: Lazy-load content for matched skills only
      await this.ensureSkillContent(matchedSkills);

      const allSkillMetas = this.skillRegistry.list();
      const facts = this.memoryManager.searchFacts(userMessage);
      const episodes = this.memoryManager.recallEpisodes(userMessage);

      // Apply allowedTools filtering
      let tools = this.getAllToolDefinitions();
      const allowedTools = this.getActiveAllowedTools(matchedSkills);
      if (allowedTools) {
        tools = tools.filter(t => allowedTools.has(t.name));
      }
      this.sessionTools = tools;
      this.sessionSystemPrompt = this.buildSystemPrompt(
        allSkillMetas,
        matchedSkills,
        facts,
        episodes,
        tools.map(t => t.name),
      );
      this.sessionInitialized = true;
    }

    // Add user message to session history
    this.sessionMessages.push({ role: 'user', content: userMessage });

    // Run the agentic loop with session context
    const { messages, response } = await this.agenticLoop(
      this.sessionSystemPrompt,
      this.sessionMessages,
      this.sessionTools,
    );

    // Update session messages with the loop results
    this.sessionMessages = messages;

    // Extract final text from response
    const text = response?.content
      .filter(b => b.type === 'text')
      .map(b => (b as any).text)
      .join('\n') || '';

    return text;
  }

  resetSession() {
    this.sessionMessages = [];
    this.sessionSystemPrompt = '';
    this.sessionTools = [];
    this.sessionInitialized = false;
  }

  // ─── Single-task Run ───────────────────────────────────────────────

  async run(userInput: string, runId?: string): Promise<Task> {
    await this.init();
    this.taskApprovals = new Set();
    this.stepResults = [];
    this.traces = [];
    this.currentPlan = [];
    this.executedPlanStepIds = new Set();
    this.skippedPlanStepIds = new Set();
    this.replannedFailures = new Set();
    this.verificationFailureCount = 0;
    this.computerUseSessionId = undefined;
    this.computerUseCheckpoint = undefined;
    this.computerUseActionCounter = 0;

    // 1. Initialize Task
    const task: Task = {
      id: `task-${Date.now()}`,
      description: userInput,
      createdAt: Date.now(),
      status: 'running',
    };

    // Set checkpoint context
    this.currentTaskId = task.id;
    this.currentRunId = runId || task.id;
    this.currentInput = userInput;
    this.currentTaskCreatedAt = task.createdAt;

    this.emit('task:start', task);

    let intentProfile: IntentProfile = this.buildFallbackIntentProfile(userInput);

    try {
      // 2. Optional: Intent Analysis
      const enableIntentAnalysis = this.config?.agent?.intentAnalysis ?? false;
      if (enableIntentAnalysis) {
        this.emit('phase:start', 'intent');
        intentProfile = await this.intentAnalyzer.analyze(userInput);
        this.emit('intent', intentProfile);
        this.emit('phase:end', 'intent');
      }

      // 3. Find Relevant Skills (topK for progressive disclosure)
      const topK = this.config?.skills?.matchTopK ?? 3;
      const matchedSkills = this.skillRegistry.match(userInput, topK);

      // 3.1 Phase 2: Lazy-load content for matched skills only
      await this.ensureSkillContent(matchedSkills);

      // 4. Retrieve Memories
      const allSkillMetas = this.skillRegistry.list();
      const facts = this.memoryManager.searchFacts(userInput);
      const episodes = this.memoryManager.recallEpisodes(userInput);

      // 5. Get tools for LLM function calling (MCP + DynamicSkill)
      let tools = this.getAllToolDefinitions();

      // 5.1 Apply allowedTools restrictions from matched skills
      const allowedTools = this.getActiveAllowedTools(matchedSkills);
      if (allowedTools) {
        tools = tools.filter(t => allowedTools.has(t.name));
      }

      const taskContext = this.buildTaskContext(
        tools,
        facts,
        episodes,
      );

      this.currentPlan = await this.createExecutionPlan(
        task,
        intentProfile,
        taskContext,
        matchedSkills,
        { facts, episodes },
      );
      if (this.currentPlan.length > 0) {
        this.emit('plan', this.currentPlan);
      }

      // 6. Build System Prompt (progressive: catalog + active details + available tools + plan guidance)
      const baseSystemPrompt = this.buildSystemPrompt(
        allSkillMetas,
        matchedSkills,
        facts,
        episodes,
        tools.map(t => t.name),
      );
      const planGuidance = this.buildPlanGuidance();
      const systemPrompt = planGuidance
        ? `${baseSystemPrompt}\n\n${planGuidance}`
        : baseSystemPrompt;

      // 7. Initialize conversation messages
      const messages: Message[] = [
        { role: 'user', content: userInput }
      ];

      this.emit('phase:start', 'execution');

      // 8. Run the shared agentic loop
      const { response: lastResponse } = await this.agenticLoop(
        systemPrompt,
        messages,
        tools,
      );

      this.emit('phase:end', 'execution');

      // Extract final text from last response
      task.status = 'completed';
      task.result = lastResponse?.content
        .filter(b => b.type === 'text')
        .map(b => (b as any).text)
        .join('\n') || 'Task completed.';

      // Save Episode and Traces
      const episodeId = this.memoryManager.recordEpisode({
        task_id: task.id,
        input: userInput,
        plan: JSON.stringify({
          iterations: this.traces.length,
          traces: this.traces.length,
          plannedSteps: this.currentPlan.map(step => ({
            id: step.id,
            description: step.description,
            tool: step.tool,
            dependsOn: step.dependsOn || [],
            verification: step.verification || [],
          })),
        }),
        result: task.result,
        strategy_id: this.activeStrategy?.metadata.id,
        strategy_version: this.activeStrategy?.metadata.version,
        created_at: Date.now()
      });

      this.memoryManager.recordTraces(episodeId, this.traces);

      this.emit('task:complete', task);

    } catch (error) {
      task.status = 'failed';
      task.result = error instanceof Error ? error.message : String(error);
      this.emit('task:error', error);
    }

    // Delete checkpoint — task is finished (success or failure)
    try {
      this.memoryManager.deleteCheckpoint(task.id);
    } catch {
      // Ignore cleanup errors
    }
    if (this.computerUseSessionId) {
      await this.closeBrowserAutomationSession(this.computerUseSessionId);
      const terminalCheckpoint = this.computerUseOrchestrator.endSession(this.computerUseSessionId);
      if (terminalCheckpoint) {
        this.memoryManager.upsertComputerUseSessionSummary({
          sessionId: terminalCheckpoint.sessionId,
          taskId: terminalCheckpoint.taskId,
          lastActionId: terminalCheckpoint.lastActionId,
          latestFrameIds: terminalCheckpoint.latestFrameIds,
          verificationFailures: terminalCheckpoint.verificationFailures,
          status: 'ended',
          endedAt: terminalCheckpoint.updatedAt,
          updatedAt: terminalCheckpoint.updatedAt,
        });
      }
      this.computerUseSessionId = undefined;
      this.computerUseCheckpoint = undefined;
    }
    this.currentTaskId = undefined;

    // Post-execution: report and feedback
    await this.persistReportAndFeedback(task, intentProfile);

    return task;
  }

  // ─── Resume from Checkpoint ──────────────────────────────────────

  /**
   * Resume an interrupted task from a persisted checkpoint.
   * Restores the conversation history, traces, and iteration counter,
   * then continues the agentic loop from where it left off.
   */
  async resume(taskId: string): Promise<Task> {
    await this.init();

    const checkpoint = this.memoryManager.loadCheckpoint(taskId);
    if (!checkpoint) {
      throw new Error(`No checkpoint found for task ${taskId}`);
    }

    // Restore state from checkpoint
    this.taskApprovals = new Set();
    this.stepResults = [];
    this.currentPlan = [];
    this.executedPlanStepIds = new Set();
    this.skippedPlanStepIds = new Set();
    this.replannedFailures = new Set();
    this.verificationFailureCount = 0;
    this.computerUseSessionId = checkpoint.computerUseSessionId;
    this.computerUseCheckpoint = checkpoint.computerUseSessionId
      ? {
          sessionId: checkpoint.computerUseSessionId,
          taskId: checkpoint.taskId,
          lastActionId: checkpoint.computerUseLastActionId,
          latestFrameIds: this.parseCheckpointFrameIds(checkpoint.computerUseLatestFrameIdsJson),
          verificationFailures: checkpoint.computerUseVerificationFailures || 0,
          updatedAt: checkpoint.updatedAt,
        }
      : undefined;
    if (this.computerUseCheckpoint) {
      this.computerUseOrchestrator.restoreCheckpoint(this.computerUseCheckpoint);
    }
    this.computerUseActionCounter = 0;
    this.traces = JSON.parse(checkpoint.tracesJson) as Trace[];
    this.rehydrateStepResultsFromTraces(this.traces);
    const messages: Message[] = JSON.parse(checkpoint.messagesJson) as Message[];
    const tools: ToolDefinition[] = JSON.parse(checkpoint.toolsJson) as ToolDefinition[];
    const intentProfile = this.buildFallbackIntentProfile(checkpoint.input);

    // Reconstruct task object
    const task: Task = {
      id: checkpoint.taskId,
      description: checkpoint.input,
      createdAt: checkpoint.taskCreatedAt,
      status: 'running',
    };

    // Set checkpoint context for continued saves
    this.currentTaskId = task.id;
    this.currentRunId = checkpoint.runId;
    this.currentInput = checkpoint.input;
    this.currentTaskCreatedAt = checkpoint.taskCreatedAt;

    this.emit('task:resume', {
      task,
      fromIteration: checkpoint.iteration,
      tracesRestored: this.traces.length,
    });

    try {
      this.emit('phase:start', 'execution');

      // Continue the agentic loop from the checkpoint iteration
      const { response: lastResponse } = await this.agenticLoop(
        checkpoint.systemPrompt,
        messages,
        tools,
        checkpoint.iteration,  // resume from this iteration
      );

      this.emit('phase:end', 'execution');

      task.status = 'completed';
      task.result = lastResponse?.content
        .filter(b => b.type === 'text')
        .map(b => (b as any).text)
        .join('\n') || 'Task completed.';

      // Save Episode and Traces (includes traces from before + after checkpoint)
      const episodeId = this.memoryManager.recordEpisode({
        task_id: task.id,
        input: checkpoint.input,
        plan: JSON.stringify({ iterations: this.traces.length, traces: this.traces.length, resumed: true }),
        result: task.result,
        strategy_id: this.activeStrategy?.metadata.id,
        strategy_version: this.activeStrategy?.metadata.version,
        created_at: Date.now(),
      });

      this.memoryManager.recordTraces(episodeId, this.traces);

      this.emit('task:complete', task);

    } catch (error) {
      task.status = 'failed';
      task.result = error instanceof Error ? error.message : String(error);
      this.emit('task:error', error);
    }

    // Delete checkpoint — task is finished (success or failure)
    try {
      this.memoryManager.deleteCheckpoint(task.id);
    } catch {
      // Ignore cleanup errors
    }
    if (this.computerUseSessionId) {
      await this.closeBrowserAutomationSession(this.computerUseSessionId);
      const terminalCheckpoint = this.computerUseOrchestrator.endSession(this.computerUseSessionId);
      if (terminalCheckpoint) {
        this.memoryManager.upsertComputerUseSessionSummary({
          sessionId: terminalCheckpoint.sessionId,
          taskId: terminalCheckpoint.taskId,
          lastActionId: terminalCheckpoint.lastActionId,
          latestFrameIds: terminalCheckpoint.latestFrameIds,
          verificationFailures: terminalCheckpoint.verificationFailures,
          status: 'ended',
          endedAt: terminalCheckpoint.updatedAt,
          updatedAt: terminalCheckpoint.updatedAt,
        });
      }
      this.computerUseSessionId = undefined;
      this.computerUseCheckpoint = undefined;
    }
    this.currentTaskId = undefined;

    await this.persistReportAndFeedback(task, intentProfile);

    return task;
  }

  // ─── Shared Agentic Loop ───────────────────────────────────────────

  private async agenticLoop(
    systemPrompt: string,
    messages: Message[],
    tools: ToolDefinition[],
    startIteration: number = 0,
  ): Promise<{ messages: Message[]; response: LLMResponse | null }> {
    const maxIterations = this.config?.agent?.maxIterations ?? 50;
    let iteration = startIteration;
    let lastResponse: LLMResponse | null = null;

    while (iteration < maxIterations) {
      iteration++;

      // Call LLM with retry and optional streaming (P1-2, P2-5)
      const response = await this.callLLMWithRetry({
        system: systemPrompt,
        messages,
        tools: tools.length > 0 ? tools : undefined,
        max_tokens: 4096,
        temperature: this.activeStrategy?.planning?.temperature ?? 0.2,
      });

      lastResponse = response;

      // Append assistant response to conversation history
      messages.push({
        role: 'assistant',
        content: response.content,
      });

      // Check if LLM wants to use tools
      const toolUses = response.content.filter(
        (b): b is ToolUseContent => b.type === 'tool_use'
      );

      if (response.stop_reason !== 'tool_use' || toolUses.length === 0) {
        // Done — LLM has finished reasoning.
        // In non-streaming mode, emit message events for final response.
        const useStreaming = this.config?.agent?.streaming ?? true;
        if (!useStreaming) {
          for (const block of response.content) {
            if (block.type === 'text' && block.text.trim()) {
              this.emit('message', { role: 'assistant', text: block.text });
            }
            if (block.type === 'thinking') {
              this.emit('thinking', (block as any).thinking);
            }
          }
        }
        break;
      }

      // In non-streaming mode, emit text/thinking from intermediate responses
      const useStreaming = this.config?.agent?.streaming ?? true;
      if (!useStreaming) {
        for (const block of response.content) {
          if (block.type === 'text' && block.text.trim()) {
            this.emit('message', { role: 'assistant', text: block.text });
          }
          if (block.type === 'thinking') {
            this.emit('thinking', (block as any).thinking);
          }
        }
      }

      // Execute tool calls and collect results
      const toolResultBlocks: ContentBlock[] = [];

      for (const toolUse of toolUses) {
        const plannedStep = this.selectPlannedStepForTool(toolUse.name);
        const stepId = plannedStep?.id ?? `step-tool-${this.stepResults.length + 1}`;
        this.emit('tool:start', { name: toolUse.name, input: toolUse.input });

        try {
          // Check if this is a DynamicSkill tool (P2-1)
          const dynamicSkill = this.skillToolMap.get(toolUse.name);
          if (dynamicSkill) {
            const start = Date.now();
            const result = await dynamicSkill.execute(toolUse.name, toolUse.input, {});
            const duration = Date.now() - start;

            const outputText = this.toDisplayText(result);
            const verification = this.evaluateStepVerification(plannedStep, outputText);
            if (!verification.passed) {
              const failMessage = this.buildVerificationFailureMessage(plannedStep, verification.failedCriteria, outputText);
              toolResultBlocks.push({
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: failMessage,
                is_error: true,
              });
              this.traces.push({
                step_index: this.traces.length,
                tool_name: toolUse.name,
                tool_args: JSON.stringify(toolUse.input),
                tool_output: failMessage,
                duration,
                status: 'failed',
              });
              this.recordFailedStep(stepId, plannedStep, failMessage, duration, messages);
              this.emit('tool:error', { name: toolUse.name, error: failMessage, code: 'VERIFICATION_FAILED' });
              continue;
            }

            toolResultBlocks.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: result,
            });

            this.traces.push({
              step_index: this.traces.length,
              tool_name: toolUse.name,
              tool_args: JSON.stringify(toolUse.input),
              tool_output: result,
              duration,
              status: 'success',
            });
            this.recordStepResult({
              stepId,
              status: 'completed',
              output: outputText,
              durationMs: duration,
              verificationStatus: 'passed',
            });
            this.markPlanStepExecuted(plannedStep);

            this.emit('tool:complete', { name: toolUse.name, result, duration });
            continue;
          }

          // Risk assessment
          let risk = assessRisk(toolUse.name, toolUse.input, this.mcpClientManager, this.config);
          risk = this.escalateRiskByVerificationState(risk, toolUse.name);
          if (risk.level === 'high') {
            const approved = await this.confirmRisk(risk, toolUse.name);
            if (!approved) {
              const deniedMsg = this.formatComputerUseFailure(
                toolUse.name,
                'POLICY_DENIED',
                'User denied this high-risk action.',
              );
              toolResultBlocks.push({
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: deniedMsg,
                is_error: true,
              });
              this.traces.push({
                step_index: this.traces.length,
                tool_name: toolUse.name,
                tool_args: JSON.stringify(toolUse.input),
                tool_output: deniedMsg,
                duration: 0,
                status: 'failed',
              });
              this.recordFailedStep(stepId, plannedStep, deniedMsg, 0, messages);
              this.emit('tool:error', {
                name: toolUse.name,
                error: deniedMsg,
                code: this.resolveCanonicalComputerUseAction(toolUse.name) ? 'POLICY_DENIED' : undefined,
              });
              continue;
            }
          }

          // Execute via MCP (computer-use tools flow through session orchestrator).
          const start = Date.now();
          const result = await this.executeToolWithComputerUseOrchestration(
            toolUse.name,
            (toolUse.input || {}) as Record<string, unknown>,
          );
          const duration = Date.now() - start;

          const normalizedResult = this.normalizeMcpResultForLoop(result);
          const textContent = normalizedResult.textSummary;

          // Record trace
          if (result.isError) {
            const failMessage = textContent || `Tool ${toolUse.name} returned an error.`;
            toolResultBlocks.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: normalizedResult.llmContent,
              is_error: true,
            });
            this.traces.push({
              step_index: this.traces.length,
              tool_name: toolUse.name,
              tool_args: JSON.stringify(toolUse.input),
              tool_output: failMessage,
              duration,
              status: 'failed',
            });
            this.recordFailedStep(stepId, plannedStep, failMessage, duration, messages);
            this.emit('tool:error', { name: toolUse.name, error: failMessage });
            continue;
          }

          const verification = this.evaluateStepVerification(plannedStep, textContent);
          if (!verification.passed) {
            const failMessage = this.buildVerificationFailureMessage(plannedStep, verification.failedCriteria, textContent);
            toolResultBlocks.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: failMessage,
              is_error: true,
            });
            this.traces.push({
              step_index: this.traces.length,
              tool_name: toolUse.name,
              tool_args: JSON.stringify(toolUse.input),
              tool_output: failMessage,
              duration,
              status: 'failed',
            });
            this.recordFailedStep(stepId, plannedStep, failMessage, duration, messages);
            this.emit('tool:error', { name: toolUse.name, error: failMessage, code: 'VERIFICATION_FAILED' });
            continue;
          } else {
            toolResultBlocks.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: normalizedResult.llmContent,
              is_error: false,
            });
            this.traces.push({
              step_index: this.traces.length,
              tool_name: toolUse.name,
              tool_args: JSON.stringify(toolUse.input),
              tool_output: textContent,
              duration,
              status: 'success',
            });
            this.recordStepResult({
              stepId,
              status: 'completed',
              output: textContent,
              durationMs: duration,
              verificationStatus: 'passed',
            });
            this.markPlanStepExecuted(plannedStep);
          }

          this.emit('tool:complete', {
            name: toolUse.name,
            result: textContent,
            richResult: normalizedResult.llmContent,
            duration
          });

        } catch (error) {
          const rawErrMsg =
            error instanceof Error
              ? error.message
              : (error && typeof error === 'object' && 'message' in error && typeof (error as any).message === 'string')
                ? (error as any).message
                : String(error);
          const code =
            error &&
            typeof error === 'object' &&
            typeof (error as any).code === 'string' &&
            isComputerUseErrorCode((error as any).code)
              ? (error as any).code
              : undefined;
          const errMsg = this.formatComputerUseFailure(toolUse.name, code, rawErrMsg);

          toolResultBlocks.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: `Tool execution failed: ${errMsg}`,
            is_error: true,
          });

          // Record failed trace
          this.traces.push({
            step_index: this.traces.length,
            tool_name: toolUse.name,
            tool_args: JSON.stringify(toolUse.input),
            tool_output: errMsg,
            duration: 0,
            status: 'failed',
          });
          this.recordFailedStep(stepId, plannedStep, errMsg, 0, messages);

          this.emit('tool:error', { name: toolUse.name, error: errMsg, code });
        }
      }

      // Append tool results to conversation.
      // Using individual 'tool' role messages — providers handle the conversion:
      // - Anthropic provider groups consecutive tool messages into one user message
      // - OpenAI provider keeps them as separate tool role messages
      for (const block of toolResultBlocks) {
        messages.push({
          role: 'tool',
          content: [block],
        });
      }

      // ─── Save Checkpoint after each complete iteration ────────────
      if (this.currentTaskId) {
        try {
          this.memoryManager.saveCheckpoint({
            taskId: this.currentTaskId,
            runId: this.currentRunId || this.currentTaskId,
            input: this.currentInput || '',
            iteration,
            messagesJson: JSON.stringify(messages),
            tracesJson: JSON.stringify(this.traces),
            systemPrompt,
            toolsJson: JSON.stringify(tools),
            computerUseSessionId: this.computerUseCheckpoint?.sessionId,
            computerUseLastActionId: this.computerUseCheckpoint?.lastActionId,
            computerUseLatestFrameIdsJson: JSON.stringify(this.computerUseCheckpoint?.latestFrameIds || []),
            computerUseVerificationFailures: this.computerUseCheckpoint?.verificationFailures || 0,
            taskCreatedAt: this.currentTaskCreatedAt || Date.now(),
            updatedAt: Date.now(),
          });
          this.emit('checkpoint:saved', { taskId: this.currentTaskId, iteration });
        } catch (err) {
          // Checkpoint save failure should not abort execution
          this.emit('checkpoint:error', { taskId: this.currentTaskId, iteration, error: err });
        }
      }
    }

    if (iteration >= maxIterations) {
      this.emit('max_iterations', { iterations: maxIterations });
    }

    return { messages, response: lastResponse };
  }

  // ─── LLM Call with Retry (P2-5) and Streaming (P1-2) ───────────────

  private buildFallbackIntentProfile(userInput: string): IntentProfile {
    return {
      category: 'unknown',
      summary: userInput,
      entities: [],
      complexity: 'medium',
      goal: userInput,
      deliverables: [],
      constraints: [],
      successCriteria: [],
      assumptions: [],
      requiredTools: [],
    };
  }

  private buildTaskContext(tools: ToolDefinition[], facts: Fact[], episodes: Episode[]): TaskContext {
    const mustConfirm = [
      ...(this.activeStrategy?.execution?.requiresConfirmation || []),
      ...(this.activeStrategy?.constraints?.mustConfirmBefore || []),
    ];
    const toolNames = tools.map((tool) => tool.name);
    return {
      cwd: process.cwd(),
      tools: toolNames,
      toolDefinitions: tools.map((tool) => ({
        name: tool.name,
        description: tool.description || '',
        inputSchema: tool.inputSchema as Record<string, unknown>,
      })),
      strategyId: this.activeStrategy?.metadata.id || 'unknown',
      strategyVersion: this.activeStrategy?.metadata.version || 'unknown',
      facts,
      episodes,
      riskPolicy: {
        requiresConfirmation: [...new Set(mustConfirm)],
        deniedTools: this.activeStrategy?.constraints?.deniedTools || [],
      },
    };
  }

  private async createExecutionPlan(
    task: Task,
    intent: IntentProfile,
    taskContext: TaskContext,
    matchedSkills: (Skill | SkillMeta)[],
    memories: { facts: Fact[]; episodes: Episode[] },
  ): Promise<Step[]> {
    if (!this.planner) return [];
    try {
      const planningSkills = matchedSkills.filter((skill): skill is Skill => hasContent(skill));
      return await this.planner.createPlan(
        task,
        intent,
        {
          taskId: task.id,
          history: [],
          state: {},
          taskContext,
        },
        planningSkills,
        memories,
      );
    } catch (error) {
      this.emit('plan:error', error);
      return [];
    }
  }

  private buildPlanGuidance(): string {
    if (this.currentPlan.length === 0) return '';
    const steps = this.currentPlan.slice(0, 12).map((step, index) => {
      const dependsOn = step.dependsOn?.length ? ` deps=[${step.dependsOn.join(', ')}]` : '';
      const verify = step.verification?.length ? ` verify=[${step.verification.join(' | ')}]` : '';
      const tool = step.tool ? ` tool=${step.tool}` : '';
      return `${index + 1}. ${step.id}:${tool} ${step.description}${dependsOn}${verify}`.trim();
    });
    return `EXECUTION PLAN (follow this order and verification intent; replan only downstream after failures):\n${steps.join('\n')}`;
  }

  private selectPlannedStepForTool(toolName: string): Step | undefined {
    if (this.currentPlan.length === 0) return undefined;
    const available = this.currentPlan.filter((step) => {
      if (step.type !== 'action') return false;
      if (this.executedPlanStepIds.has(step.id) || this.skippedPlanStepIds.has(step.id)) return false;
      return (step.dependsOn || []).every(dep => this.executedPlanStepIds.has(dep) || this.skippedPlanStepIds.has(dep));
    });
    return available.find(step => step.tool === toolName) || available[0];
  }

  private markPlanStepExecuted(step?: Step): void {
    if (!step) return;
    this.executedPlanStepIds.add(step.id);
  }

  private recordStepResult(result: StepResult): void {
    const existing = this.stepResults.findIndex(step => step.stepId === result.stepId);
    if (existing >= 0) {
      this.stepResults[existing] = { ...this.stepResults[existing], ...result };
      return;
    }
    this.stepResults.push(result);
  }

  private markDownstreamStepsSkipped(failedStepId: string, reason: string): void {
    const queue = [failedStepId];
    while (queue.length > 0) {
      const sourceId = queue.shift()!;
      const dependents = this.currentPlan.filter((step) =>
        (step.dependsOn || []).includes(sourceId)
      );
      for (const dependent of dependents) {
        if (this.executedPlanStepIds.has(dependent.id) || this.skippedPlanStepIds.has(dependent.id)) {
          continue;
        }
        this.skippedPlanStepIds.add(dependent.id);
        this.recordStepResult({
          stepId: dependent.id,
          status: 'skipped',
          error: `Skipped due to upstream failure (${failedStepId}): ${reason}`,
          verificationStatus: 'failed',
        });
        queue.push(dependent.id);
      }
    }
  }

  private enqueueFailureReplan(messages: Message[], failedStep: Step | undefined, reason: string): void {
    const enableFailureReplan = this.config?.agent?.failureReplan ?? true;
    if (!enableFailureReplan) return;

    const failedKey = failedStep?.id || `ad-hoc-${this.replannedFailures.size + 1}`;
    if (this.replannedFailures.has(failedKey)) return;
    this.replannedFailures.add(failedKey);

    const downstream = failedStep
      ? this.currentPlan
        .filter(step => (step.dependsOn || []).includes(failedStep.id))
        .map(step => step.id)
      : [];
    const downstreamText = downstream.length > 0 ? downstream.join(', ') : 'remaining steps';

    messages.push({
      role: 'user',
      content: `Replan request: step ${failedStep?.id || 'unknown'} failed (${reason}). Only replan downstream steps: ${downstreamText}. Keep completed steps unchanged.`,
    });

    this.recordStepResult({
      stepId: `replan-${failedKey}`,
      status: 'completed',
      output: `Triggered downstream replan due to failure on ${failedStep?.id || 'unknown step'}.`,
      verificationStatus: 'pending',
    });
  }

  private recordFailedStep(
    stepId: string,
    plannedStep: Step | undefined,
    error: string,
    durationMs: number,
    messages: Message[],
  ): void {
    this.verificationFailureCount += 1;
    this.recordStepResult({
      stepId,
      status: 'failed',
      error,
      durationMs,
      verificationStatus: 'failed',
    });
    this.markPlanStepExecuted(plannedStep);
    if (plannedStep) {
      this.markDownstreamStepsSkipped(plannedStep.id, error);
    }
    this.enqueueFailureReplan(messages, plannedStep, error);
  }

  private evaluateStepVerification(
    plannedStep: Step | undefined,
    outputText: string,
  ): VerificationEvaluation {
    const checks = (plannedStep?.verification || [])
      .map((criterion) => criterion.trim())
      .filter((criterion) => criterion.length > 0);
    if (checks.length === 0) {
      return { passed: true, failedCriteria: [] };
    }

    const failedCriteria = checks.filter((criterion) =>
      !this.evaluateVerificationCriterion(criterion, outputText),
    );

    return {
      passed: failedCriteria.length === 0,
      failedCriteria,
    };
  }

  private evaluateVerificationCriterion(criterion: string, outputText: string): boolean {
    const normalizedOutput = outputText.trim();
    const lowerOutput = normalizedOutput.toLowerCase();
    const lowerCriterion = criterion.trim().toLowerCase();

    if (lowerCriterion.startsWith('contains:')) {
      const expected = criterion.slice('contains:'.length).trim();
      return expected.length > 0 && lowerOutput.includes(expected.toLowerCase());
    }

    if (lowerCriterion.startsWith('not_contains:')) {
      const denied = criterion.slice('not_contains:'.length).trim();
      return denied.length === 0 || !lowerOutput.includes(denied.toLowerCase());
    }

    if (lowerCriterion.startsWith('regex:')) {
      const pattern = criterion.slice('regex:'.length).trim();
      if (!pattern) return false;
      try {
        return new RegExp(pattern, 'm').test(normalizedOutput);
      } catch {
        return false;
      }
    }

    if (lowerCriterion.startsWith('min_length:')) {
      const min = Number.parseInt(criterion.slice('min_length:'.length).trim(), 10);
      if (!Number.isFinite(min)) return false;
      return normalizedOutput.length >= min;
    }

    const quotedFragments = this.extractQuotedFragments(criterion);
    if (quotedFragments.length > 0) {
      return quotedFragments.every((fragment) => lowerOutput.includes(fragment.toLowerCase()));
    }

    if (/\bpath\b/.test(lowerCriterion)) {
      return this.containsPathLikeText(normalizedOutput);
    }

    if (/\bjson\b/.test(lowerCriterion)) {
      return this.looksLikeJson(normalizedOutput);
    }

    if (/\b(success|succeed|successful|ok|completed|done)\b/.test(lowerCriterion)) {
      return this.isLikelySuccessfulOutput(normalizedOutput);
    }

    if (/\b(no error|without error|no failures?)\b/.test(lowerCriterion)) {
      return !this.containsFailureSignals(lowerOutput);
    }

    if (/\b(exists?|present|found)\b/.test(lowerCriterion)) {
      return !this.containsMissingSignals(lowerOutput);
    }

    if (/\b(non[- ]?empty|not empty|returned|output)\b/.test(lowerCriterion)) {
      return normalizedOutput.length > 0 && !this.containsFailureSignals(lowerOutput);
    }

    return normalizedOutput.length > 0 && !this.containsFailureSignals(lowerOutput);
  }

  private extractQuotedFragments(text: string): string[] {
    const matches = [...text.matchAll(/"([^"]+)"|'([^']+)'/g)];
    return matches
      .map((match) => (match[1] || match[2] || '').trim())
      .filter((value) => value.length > 0);
  }

  private containsPathLikeText(text: string): boolean {
    return /([a-zA-Z]:\\[^\s]+|\/[^\s]+)/.test(text);
  }

  private looksLikeJson(text: string): boolean {
    const trimmed = text.trim();
    if (!trimmed) return false;
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        JSON.parse(trimmed);
        return true;
      } catch {
        return false;
      }
    }
    const match = trimmed.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (!match) return false;
    try {
      JSON.parse(match[1]);
      return true;
    } catch {
      return false;
    }
  }

  private containsFailureSignals(lowerOutput: string): boolean {
    return /\b(error|failed|failure|exception|denied|not found|invalid|timeout|timed out)\b/.test(lowerOutput);
  }

  private containsMissingSignals(lowerOutput: string): boolean {
    return /\b(missing|not found|does not exist|no such file|no such directory)\b/.test(lowerOutput);
  }

  private isLikelySuccessfulOutput(outputText: string): boolean {
    const lowerOutput = outputText.toLowerCase();
    if (this.containsFailureSignals(lowerOutput)) return false;
    if (!outputText.trim()) return false;
    return /\b(success|succeeded|ok|completed|done|true|passed)\b/.test(lowerOutput);
  }

  private buildVerificationFailureMessage(
    plannedStep: Step | undefined,
    failedCriteria: string[],
    outputText: string,
  ): string {
    const stepLabel = plannedStep?.id || 'unplanned-step';
    const criteriaText = failedCriteria.length > 0
      ? failedCriteria.map((criterion) => `"${criterion}"`).join(', ')
      : 'unspecified verification criteria';
    const outputSnippet = this.truncateText(outputText, 280) || '(empty output)';
    return `Verification failed for ${stepLabel}. Unmet checks: ${criteriaText}. Output snippet: ${outputSnippet}`;
  }

  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength)}...`;
  }

  private parseCheckpointFrameIds(value?: string): string[] {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((item): item is string => typeof item === 'string');
    } catch {
      return [];
    }
  }

  private async executeToolWithComputerUseOrchestration(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<any> {
    const canonical = this.resolveCanonicalComputerUseAction(toolName);
    if (!canonical || !this.currentTaskId) {
      return await this.mcpClientManager.callTool(toolName, args);
    }

    const sessionId =
      this.computerUseSessionId ||
      `cus-${this.currentTaskId}-${Date.now().toString(36)}`;
    this.computerUseSessionId = sessionId;

    const action: ComputerUseActionEnvelope = {
      sessionId,
      actionId: `cu-action-${++this.computerUseActionCounter}`,
      domain: this.inferComputerUseDomain(canonical),
      canonicalAction: canonical,
      args,
      riskLevel: 'medium',
      requestedAt: Date.now(),
    };

    try {
      const dispatchResult = await this.computerUseOrchestrator.dispatchCanonicalAction({
        taskId: this.currentTaskId,
        action,
        adapter: this.computerUseAdapter,
        toolName,
        invokeTool: async (resolvedToolName, resolvedArgs) =>
          await this.mcpClientManager.callTool(
            resolvedToolName,
            this.attachInternalBrowserSessionArg(resolvedToolName, sessionId, resolvedArgs),
          ),
      });
      this.memoryManager.recordObservationFrame(this.currentTaskId, dispatchResult.frame);
      this.memoryManager.upsertComputerUseSessionSummary({
        sessionId: dispatchResult.checkpoint.sessionId,
        taskId: dispatchResult.checkpoint.taskId,
        lastActionId: dispatchResult.checkpoint.lastActionId,
        latestFrameIds: dispatchResult.checkpoint.latestFrameIds,
        verificationFailures: dispatchResult.checkpoint.verificationFailures,
        status: 'active',
        updatedAt: dispatchResult.checkpoint.updatedAt,
      });
      this.computerUseCheckpoint = dispatchResult.checkpoint;
      return dispatchResult.toolResult;
    } catch (error) {
      const failedCheckpoint = this.computerUseOrchestrator.getCheckpoint(sessionId);
      if (failedCheckpoint) {
        this.memoryManager.upsertComputerUseSessionSummary({
          sessionId: failedCheckpoint.sessionId,
          taskId: failedCheckpoint.taskId,
          lastActionId: failedCheckpoint.lastActionId,
          latestFrameIds: failedCheckpoint.latestFrameIds,
          verificationFailures: failedCheckpoint.verificationFailures,
          status: 'active',
          updatedAt: failedCheckpoint.updatedAt,
        });
        this.computerUseCheckpoint = failedCheckpoint;
      }
      throw error;
    }
  }

  private resolveCanonicalComputerUseAction(toolName: string): string | undefined {
    const direct = resolveCanonicalComputerUseToolName(toolName);
    if (direct) return direct;
    const slashIndex = toolName.indexOf('/');
    if (slashIndex > 0 && slashIndex < toolName.length - 1) {
      return resolveCanonicalComputerUseToolName(toolName.slice(slashIndex + 1));
    }
    return undefined;
  }

  private attachInternalBrowserSessionArg(
    toolName: string,
    sessionId: string,
    args: Record<string, unknown>,
  ): Record<string, unknown> {
    const toolInfo = this.mcpClientManager.getToolInfo(toolName);
    if (!toolInfo || toolInfo.serverId !== 'internal-browser') {
      return args;
    }
    return {
      ...args,
      __lydiaSessionId: sessionId,
    };
  }

  private async closeBrowserAutomationSession(sessionId: string): Promise<void> {
    if (!sessionId || !this.browserServer) return;
    try {
      await this.browserServer.closeSession(sessionId);
    } catch {
      // Best-effort cleanup only; session shutdown should not mask task result.
    }
  }

  private inferComputerUseDomain(canonicalAction: string): ComputerUseDomain {
    return canonicalAction.startsWith('desktop_') ? 'desktop' : 'browser';
  }

  private formatComputerUseFailure(
    toolName: string,
    code: string | undefined,
    message: string,
  ): string {
    const canonical = this.resolveCanonicalComputerUseAction(toolName);
    if (!canonical) return message;
    if (!code) return message;
    return `${code}: ${message}`;
  }

  private toDisplayText(value: unknown): string {
    if (typeof value === 'string') return value;
    if (value == null) return '';
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  private normalizeMcpResultForLoop(result: any): {
    llmContent: string | Array<TextContent | ImageContent>;
    textSummary: string;
  } {
    const richBlocks = this.extractMcpRichBlocks(result);
    if (richBlocks.length === 0) {
      const fallback = this.toDisplayText(result);
      return { llmContent: fallback, textSummary: fallback };
    }

    const textSummary = richBlocks
      .filter((block): block is TextContent => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();

    if (textSummary) {
      return { llmContent: richBlocks, textSummary };
    }

    const imageCount = richBlocks.filter((block) => block.type === 'image').length;
    return {
      llmContent: richBlocks,
      textSummary: imageCount > 0 ? `[${imageCount} image result block(s)]` : '',
    };
  }

  private extractMcpRichBlocks(result: any): Array<TextContent | ImageContent> {
    if (!result || !Array.isArray(result.content)) return [];
    const normalized: Array<TextContent | ImageContent> = [];

    for (const block of result.content) {
      if (block?.type === 'text' && typeof block.text === 'string') {
        normalized.push({ type: 'text', text: block.text });
        continue;
      }

      if (block?.type === 'image') {
        const mediaType =
          typeof block.source?.media_type === 'string'
            ? block.source.media_type
            : typeof block.mimeType === 'string'
              ? block.mimeType
              : undefined;
        const data =
          typeof block.source?.data === 'string'
            ? block.source.data
            : typeof block.data === 'string'
              ? block.data
              : undefined;
        if (!mediaType || !data) {
          continue;
        }
        normalized.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: mediaType,
            data,
          },
        });
      }
    }

    return normalized;
  }

  private escalateRiskByVerificationState(risk: RiskAssessment, toolName: string): RiskAssessment {
    if (risk.level === 'high') return risk;
    if (this.verificationFailureCount <= 0) return risk;
    const isRiskyTool = toolName === 'shell_execute' || toolName.startsWith('fs_') || toolName.startsWith('git_');
    if (!isRiskyTool) return risk;
    return {
      level: 'high',
      reason: 'Prior verification failures detected; require explicit confirmation before continuing risky operations',
      signature: `verification_failure_guard:${toolName}`,
      details: `verification_failures=${this.verificationFailureCount}`,
    };
  }

  private rehydrateStepResultsFromTraces(traces: Trace[]): void {
    if (traces.length === 0) return;
    for (const trace of traces) {
      if (trace.status === 'failed') {
        this.verificationFailureCount += 1;
      }
      this.recordStepResult({
        stepId: `trace-${trace.step_index + 1}`,
        status: trace.status === 'failed' ? 'failed' : 'completed',
        output: trace.status === 'failed' ? undefined : trace.tool_output,
        error: trace.status === 'failed' ? trace.tool_output : undefined,
        durationMs: trace.duration,
        verificationStatus: trace.status === 'failed' ? 'failed' : 'passed',
      });
    }
  }

  private async persistReportAndFeedback(task: Task, intentProfile: IntentProfile): Promise<void> {
    if (this.stepResults.length === 0) {
      this.recordStepResult({
        stepId: 'final',
        status: task.status === 'completed' ? 'completed' : 'failed',
        output: task.status === 'completed' ? task.result : undefined,
        error: task.status === 'failed' ? task.result : undefined,
        verificationStatus: task.status === 'completed' ? 'passed' : 'failed',
      });
    }

    const report = this.reporter.generateReport(task, intentProfile, this.stepResults);
    this.memoryManager.recordTaskReport(task.id, report);

    const shouldRequestFeedback = task.status === 'failed' || (this.activeStrategy?.preferences?.userConfirmation ?? 0.8) >= 0.8;
    const skipFeedback = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
    if (!shouldRequestFeedback || skipFeedback || !this.mcpClientManager.getToolInfo('ask_user')) {
      return;
    }

    try {
      const feedback = await this.feedbackCollector.collect(task, report, async (prompt) => {
        const result = await this.mcpClientManager.callTool('ask_user', { prompt });
        const textContent = (result.content as any[])
          .filter((c: any) => c.type === 'text')
          .map((c: any) => c.text)
          .join('\n')
          .trim();
        return textContent;
      });

      if (feedback) {
        this.memoryManager.recordTaskFeedback(task.id, feedback);
      }
    } catch {
      // Ignore feedback collection errors
    }
  }

  private async callLLMWithRetry(request: LLMRequest): Promise<LLMResponse> {
    const maxRetries = this.config?.agent?.maxRetries ?? 3;
    const retryDelayMs = this.config?.agent?.retryDelayMs ?? 1000;

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.callLLM(request);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < maxRetries && this.isRetryableError(lastError)) {
          const delay = retryDelayMs * Math.pow(2, attempt);
          this.emit('retry', { attempt: attempt + 1, maxRetries, delay, error: lastError.message });
          await this.sleep(delay);
        } else {
          throw lastError;
        }
      }
    }
    throw lastError!;
  }

  private async callLLM(request: LLMRequest): Promise<LLMResponse> {
    const useStreaming = this.config?.agent?.streaming ?? true;

    if (useStreaming) {
      let response: LLMResponse | null = null;
      for await (const chunk of this.llm.generateStream(request)) {
        switch (chunk.type) {
          case 'text_delta':
            this.emit('stream:text', chunk.text);
            break;
          case 'thinking_delta':
            this.emit('stream:thinking', chunk.thinking);
            break;
          case 'message_stop':
            response = chunk.response;
            break;
          case 'error':
            throw new Error(chunk.error);
        }
      }
      if (!response) throw new Error('Stream ended without a response');
      return response;
    } else {
      return await this.llm.generate(request);
    }
  }

  private isRetryableError(error: Error): boolean {
    const msg = error.message.toLowerCase();
    return (
      msg.includes('rate limit') ||
      msg.includes('429') ||
      msg.includes('500') ||
      msg.includes('502') ||
      msg.includes('503') ||
      msg.includes('504') ||
      msg.includes('timeout') ||
      msg.includes('econnreset') ||
      msg.includes('econnrefused') ||
      msg.includes('network') ||
      msg.includes('fetch failed')
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ─── Interaction ──────────────────────────────────────────────────────

  public resolveInteraction(id: string, response: string): boolean {
    if (!this.interactionServer) return false;
    return this.interactionServer.resolve(id, response);
  }

  // ─── System Prompt Construction ───────────────────────────────────────

  /**
   * Build the system prompt with progressive skill disclosure:
   * - Layer 1: Lightweight catalog of ALL registered skills (name + description)
   * - Layer 2: Full content of only the top-K matched skills
   */
  private buildSystemPrompt(
    allSkills: (Skill | SkillMeta)[],
    activeSkills: (Skill | SkillMeta)[],
    facts: Fact[],
    episodes: Episode[],
    toolNames: string[] = [],
  ): string {
    const sections: string[] = [];

    // Strategy-defined personality and role
    if (this.activeStrategy?.system) {
      const sys = this.activeStrategy.system;
      sections.push(sys.role);
      if (sys.personality) {
        sections.push(`Personality: ${sys.personality}`);
      }
      if (sys.goals.length > 0) {
        sections.push(`Goals:\n${sys.goals.map(g => `- ${g}`).join('\n')}`);
      }
      if (sys.constraints.length > 0) {
        sections.push(`Constraints:\n${sys.constraints.map(c => `- ${c}`).join('\n')}`);
      }
    }

    // Environment info
    sections.push(`Current working directory: ${process.cwd()}`);

    // Tool usage instructions
    sections.push(
      'You have access to tools via function calling. ' +
      'Use tools when you need to interact with the system (files, shell, git, memory, etc.). ' +
      'When you are done with the task, respond with your final answer as text.'
    );
    if (toolNames.length > 0) {
      sections.push(`AVAILABLE TOOLS:\n${toolNames.map(name => `- ${name}`).join('\n')}`);
    }

    // Safety constraints from strategy
    const deniedTools = this.activeStrategy?.constraints?.deniedTools || [];
    if (deniedTools.length > 0) {
      sections.push(`DENIED TOOLS (never use these): ${deniedTools.join(', ')}`);
    }

    const mustConfirm = [
      ...(this.activeStrategy?.execution?.requiresConfirmation || []),
      ...(this.activeStrategy?.constraints?.mustConfirmBefore || []),
    ];
    if (mustConfirm.length > 0) {
      sections.push(`HIGH-RISK TOOLS (will require user confirmation): ${[...new Set(mustConfirm)].join(', ')}`);
    }

    // Layer 1: Lightweight skill catalog (all skills, name + description only)
    if (allSkills.length > 0) {
      const catalogLines = allSkills.map(s => {
        const tags = s.tags?.length ? ` [${s.tags.join(', ')}]` : '';
        return `- ${s.name}: ${s.description}${tags}`;
      });
      sections.push(`AVAILABLE SKILLS (${allSkills.length} total):\n${catalogLines.join('\n')}`);
    }

    // Layer 2: Full content of matched/active skills only (progressive disclosure)
    const activeWithContent = activeSkills.filter(s => hasContent(s));
    if (activeWithContent.length > 0) {
      const skillText = activeWithContent
        .map(s => `--- SKILL: ${s.name} ---\n${getSkillContent(s)}\n--- END SKILL ---`)
        .join('\n');
      sections.push(`ACTIVE SKILL DETAILS (follow these instructions):\n${skillText}`);
    }

    // Memory context
    if (facts.length > 0) {
      sections.push(
        `REMEMBERED FACTS:\n${facts.map(f => `- ${f.content}`).join('\n')}`
      );
    }
    if (episodes.length > 0) {
      const episodeText = episodes
        .slice(0, 5)
        .map(e => `- "${e.input}" → ${e.result.substring(0, 100)}...`)
        .join('\n');
      sections.push(`PAST SIMILAR TASKS:\n${episodeText}`);
    }

    // Use strategy's custom planning prompt if provided (as additional instructions)
    if (this.activeStrategy?.prompts?.planning) {
      sections.push(`STRATEGY INSTRUCTIONS:\n${this.activeStrategy.prompts.planning}`);
    }

    return sections.join('\n\n');
  }

  /**
   * Lazy-load content for matched skills that don't have content in memory yet.
   */
  private async ensureSkillContent(skills: (Skill | SkillMeta)[]): Promise<void> {
    for (const skill of skills) {
      if (!hasContent(skill) && skill.path) {
        const content = await this.skillLoader.loadContent(skill.name);
        if (content) {
          (skill as any).content = content;
        }
      }
    }
  }

  // ─── Risk Management ──────────────────────────────────────────────────

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
    const textContent = (result.content as any[])
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
}
