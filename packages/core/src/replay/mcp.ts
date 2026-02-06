import { McpClientManager } from '../mcp/index.js';
import type { Trace } from '../memory/index.js';

export class ReplayMcpClientManager extends McpClientManager {
  private traces: Trace[];
  private callIndex = 0;

  constructor(traces: Trace[]) {
    super();
    this.traces = traces;
  }

  // Override connect to do nothing
  async connect(config: any) {
    return {} as any;
  }

  // Override callTool to return recorded output
  async callTool(name: string, args: any) {
    // Find next trace for this tool
    // We assume deterministic order. If the plan executes tools in the same order, this works.
    const trace = this.traces[this.callIndex];

    if (!trace) {
      throw new Error(`Replay Error: No more traces available, but tool '${name}' was called.`);
    }

    if (trace.tool_name !== name) {
      console.warn(`[Replay Drift] Expected tool '${trace.tool_name}' but got '${name}' at index ${this.callIndex}`);
    }

    // Drift Detection: Args
    const originalArgs = JSON.parse(trace.tool_args);
    if (JSON.stringify(originalArgs) !== JSON.stringify(args)) {
      console.warn(`[Replay Drift] Arguments mismatch for tool '${name}' at index ${this.callIndex}`);
      // console.warn('Expected:', originalArgs);
      // console.warn('Got:', args);
    }

    this.callIndex++;

    // Return stored output
    const output = JSON.parse(trace.tool_output);

    // Simulate error if originally failed
    if (trace.status === 'failed') {
      throw new Error(output); // Output stores error message in failure case
    }

    return output;
  }
}
