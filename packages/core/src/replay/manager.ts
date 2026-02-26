import { Agent } from '../execution/index.js';
import { MemoryManager } from '../memory/index.js';
import { ReplayLLMProvider } from './llm.js';
import { SimplePlanner } from '../strategy/planner.js';
import { ReplayMcpClientManager } from './mcp.js';
import { Strategy } from '../strategy/strategy.js';
import { StrategyEvaluator, EvaluationResult, StrategyComparison } from './evaluator.js';
import * as path from 'node:path';
import * as os from 'node:os';

export class ReplayManager {
  private memoryManager: MemoryManager;
  private evaluator: StrategyEvaluator;

  constructor(memoryManager?: MemoryManager) {
    if (memoryManager) {
      this.memoryManager = memoryManager;
    } else {
      const dbPath = path.join(os.homedir(), '.lydia', 'memory.db');
      this.memoryManager = new MemoryManager(dbPath);
    }
    this.evaluator = new StrategyEvaluator();
  }

  async replay(episodeId: number, customStrategy?: Strategy): Promise<EvaluationResult> {
    // 1. Load Episode & Traces
    const episode = this.memoryManager.getEpisode(episodeId);
    if (!episode) {
      throw new Error(`Episode ${episodeId} not found.`);
    }

    const traces = this.memoryManager.getTraces(episodeId);
    // console.log(`Replaying Episode #${episodeId}: "${episode.input}" (${traces.length} steps)`);

    // 2. Setup Mocks
    const mockLLM = new ReplayLLMProvider(episode.plan);
    const mockMcp = new ReplayMcpClientManager(traces);

    // 3. Initialize Agent with Mocks
    const agent = new Agent(mockLLM);

    // Inject Mock MCP (We need a way to inject it, or we hack it by overwriting the property)
    // Since McpClientManager is private, we can use 'any' casting or add a setter.
    // For now, let's use 'any' to overwrite it.
    (agent as any).mcpClientManager = mockMcp;

    // We also need to prevent Agent.init() from overwriting our mock MCP with real connections.
    // We can set isInitialized = true, then manually wire required dependencies.
    (agent as any).isInitialized = true;

    // Manually initialize minimal dependencies for replay.
    const tempDb = path.join(os.tmpdir(), `lydia-replay-${Date.now()}-${episodeId}.db`);
    (agent as any).memoryManager = new MemoryManager(tempDb);

    try {
      const config = await (agent as any).configLoader.load();
      (agent as any).config = config;

      // Use custom strategy if provided, otherwise default
      if (customStrategy) {
        (agent as any).activeStrategy = customStrategy;
      } else {
        const strategyRegistry = (agent as any).strategyRegistry;
        const activeStrategy = await strategyRegistry.loadDefault();
        (agent as any).activeStrategy = activeStrategy;
      }

      // Initialize Planner
      (agent as any).planner = new SimplePlanner(mockLLM, (agent as any).activeStrategy);
    } catch (error) {
      console.warn('Replay init warning:', error);
    }

    await (agent as any).skillLoader.loadAll();

    // 4. Run Execution
    const start = Date.now();
    let resultTask;
    try {
      resultTask = await agent.run(episode.input);
    } catch (error) {
      resultTask = {
        id: `failed-${Date.now()}`,
        description: episode.input,
        status: 'failed' as const,
        result: String(error),
        createdAt: Date.now()
      };
    }
    const duration = Date.now() - start;

    // 5. Evaluate
    const evaluation = this.evaluator.evaluateTask(resultTask, episode.result, {
      duration,
      steps: mockMcp.getInvocationCount(),
      driftDetected: mockMcp.drifts.length > 0,
      riskEvents: mockMcp.getRiskEventCount(),
      humanInterrupts: mockMcp.getHumanInterruptCount(),
    });

    return evaluation;
  }

  async replayBatch(episodeIds: number[], strategy?: Strategy): Promise<EvaluationResult[]> {
    const results: EvaluationResult[] = [];
    for (const id of episodeIds) {
      try {
        const res = await this.replay(id, strategy);
        results.push(res);
      } catch (e) {
        console.error(`Failed to replay episode ${id}:`, e);
      }
    }
    return results;
  }

  async replayCompare(
    episodeIds: number[],
    baseline: Strategy,
    candidate: Strategy
  ): Promise<StrategyComparison> {
    const baselineResults = await this.replayBatch(episodeIds, baseline);
    const candidateResults = await this.replayBatch(episodeIds, candidate);
    return this.evaluator.compareResults(baselineResults, candidateResults);
  }
}
