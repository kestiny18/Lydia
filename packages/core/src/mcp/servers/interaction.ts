import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';

export interface InteractionRequest {
  id: string;
  type: 'text' | 'confirm';
  prompt: string;
}

export class InteractionServer extends EventEmitter {
  public server: Server;
  private pendingInteractions = new Map<string, (response: any) => void>();

  constructor() {
    super();
    this.server = new Server(
      { name: "internal-interaction", version: "0.1.0" },
      { capabilities: { tools: {} } }
    );
    this.setupHandlers();
  }

  private setupHandlers() {
    // 1. List Tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [{
        name: "ask_user",
        description: "Ask the user a question or request confirmation. Use this when you need permission for risky actions, need clarification on requirements, or want to confirm a choice.",
        inputSchema: {
          type: "object",
          properties: {
            prompt: { type: "string", description: "The question or confirmation message to ask the user" },
          },
          required: ["prompt"]
        }
      }]
    }));

    // 2. Handle Tool Call
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name !== "ask_user") {
        throw new Error(`Unknown tool: ${request.params.name}`);
      }

      const args = request.params.arguments as any;
      const id = randomUUID();

      // Emit event for Agent to forward to CLI
      const interaction: InteractionRequest = {
        id,
        type: 'text',
        prompt: args.prompt
      };
      this.emit('request', interaction);

      // Return a Promise that resolves when the CLI responds
      const responseText = await new Promise<string>((resolve) => {
        this.pendingInteractions.set(id, resolve);
      });

      return {
        content: [{ type: "text", text: responseText }]
      };
    });
  }

  // Called by Agent/CLI to provide the user's answer
  public resolve(id: string, response: string) {
    const resolver = this.pendingInteractions.get(id);
    if (resolver) {
      resolver(response);
      this.pendingInteractions.delete(id);
      return true;
    }
    return false;
  }
}
