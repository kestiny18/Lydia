import {
  type ILLMProvider,
  type LLMRequest,
  type LLMResponse,
  type ContentBlock,
  type Message,
  type TextContent,
  type ToolUseContent
} from '../index.js';

type OllamaMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  images?: string[];
  tool_calls?: Array<{
    function: {
      name: string;
      description?: string;
      arguments?: Record<string, unknown>;
    };
  }>;
};

type OllamaChatResponse = {
  model: string;
  message: {
    role: 'assistant';
    content: string;
    thinking?: string;
    tool_calls?: Array<{
      function: {
        name: string;
        description?: string;
        arguments?: Record<string, unknown>;
      };
    }>;
  };
  done: boolean;
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
};

export class OllamaProvider implements ILLMProvider {
  public readonly id = 'ollama';
  private baseURL: string;
  private defaultModel: string;

  constructor(options?: { baseURL?: string; defaultModel?: string }) {
    this.baseURL = options?.baseURL || process.env.OLLAMA_BASE_URL || 'http://localhost:11434/api';
    this.defaultModel = options?.defaultModel || process.env.OLLAMA_DEFAULT_MODEL || 'llama3';
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    const model = request.model || this.defaultModel;
    const messages = this.convertMessages(request.messages, request.system);

    const response = await fetch(`${this.baseURL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        tools: request.tools,
        options: this.mapOptions(request),
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ollama API error (${response.status}): ${text}`);
    }

    const payload = (await response.json()) as OllamaChatResponse;
    return this.convertResponse(payload, model);
  }

  private mapOptions(request: LLMRequest): Record<string, unknown> | undefined {
    const options: Record<string, unknown> = {};
    if (request.temperature !== undefined) {
      options.temperature = request.temperature;
    }
    if (request.max_tokens !== undefined) {
      options.num_predict = request.max_tokens;
    }
    if (request.stop && request.stop.length > 0) {
      options.stop = request.stop;
    }
    return Object.keys(options).length > 0 ? options : undefined;
  }

  private convertMessages(messages: Message[], system?: string): OllamaMessage[] {
    const output: OllamaMessage[] = [];

    if (system) {
      output.push({ role: 'system', content: system });
    }

    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        output.push({ role: msg.role as OllamaMessage['role'], content: msg.content });
        continue;
      }

      const textParts: string[] = [];
      const images: string[] = [];
      const toolCalls: OllamaMessage['tool_calls'] = [];

      for (const block of msg.content) {
        if (block.type === 'text') {
          textParts.push(block.text);
        } else if (block.type === 'image') {
          images.push(block.source.data);
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            function: {
              name: block.name,
              arguments: block.input,
            },
          });
        } else if (block.type === 'tool_result') {
          textParts.push(this.normalizeToolResult(block.content));
        }
      }

      const content = textParts.join('\n').trim();
      const message: OllamaMessage = {
        role: msg.role as OllamaMessage['role'],
        content,
      };
      if (images.length > 0) {
        message.images = images;
      }
      if (toolCalls.length > 0 && msg.role === 'assistant') {
        message.tool_calls = toolCalls;
      }

      output.push(message);
    }

    return output;
  }

  private normalizeToolResult(content: unknown): string {
    if (typeof content === 'string') return content;
    try {
      return JSON.stringify(content);
    } catch {
      return String(content);
    }
  }

  private convertResponse(payload: OllamaChatResponse, modelFallback: string): LLMResponse {
    const content: ContentBlock[] = [];
    if (payload.message?.content) {
      content.push({ type: 'text', text: payload.message.content } as TextContent);
    }
    if (payload.message?.tool_calls) {
      for (const call of payload.message.tool_calls) {
        content.push({
          type: 'tool_use',
          id: `${payload.model}-${Date.now()}`,
          name: call.function.name,
          input: call.function.arguments ?? {},
        } as ToolUseContent);
      }
    }

    const inputTokens = payload.prompt_eval_count ?? 0;
    const outputTokens = payload.eval_count ?? 0;

    return {
      id: `${payload.model}-${Date.now()}`,
      role: 'assistant',
      model: payload.model || modelFallback,
      stop_reason: this.mapStopReason(payload.done_reason),
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens,
      },
      content,
    };
  }

  private mapStopReason(reason?: string): LLMResponse['stop_reason'] {
    if (!reason) return null;
    if (reason === 'stop') return 'end_turn';
    if (reason === 'length') return 'max_tokens';
    return null;
  }
}
