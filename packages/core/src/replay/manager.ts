import { Agent } from '../execution/index.js';
import { MemoryManager } from '../memory/index.js';
import { ReplayLLMProvider } from './llm.js';
import { ReplayMcpClientManager } from './mcp.js';
import * as path from 'node:path';
import * as os from 'node:os';

export class ReplayManager {
  private memoryManager: MemoryManager;

  constructor() {
    const dbPath = path.join(os.homedir(), '.lydia', 'memory.db');
    this.memoryManager = new MemoryManager(dbPath);
  }

  async replay(episodeId: number) {
    // 1. Load Episode & Traces
    const episode = this.memoryManager.getEpisode(episodeId);
    if (!episode) {
      throw new Error(`Episode ${episodeId} not found.`);
    }

    const traces = this.memoryManager.getTraces(episodeId);
    console.log(`Replaying Episode #${episodeId}: "${episode.input}" (${traces.length} steps)`);

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
    // We can set isInitialized = true
    (agent as any).isInitialized = true;

    // But we DO need to load skills/config?
    // Ideally, Agent should accept dependencies in constructor or init options.
    // For this MVP, let's manually load what's needed.
    await (agent as any).skillLoader.loadAll();

    // 4. Run Execution
    console.log('--- Replay Start ---');
    try {
      const resultTask = await agent.run(episode.input);
      console.log('--- Replay Complete ---');
      console.log(`Original Result: ${episode.result?.substring(0, 50)}...`);
      console.log(`Replay Result:   ${resultTask.result?.substring(0, 50)}...`);

      if (resultTask.status === 'completed') {
        console.log('✅ Replay Successful');
      } else {
        console.log('❌ Replay Failed');
      }
    } catch (error) {
      console.error('❌ Replay Error:', error);
    }
  }
}
