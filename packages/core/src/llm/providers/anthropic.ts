import Anthropic from '@anthropic-ai/sdk';
import {
  type ILLMProvider,
  type LLMRequest,
  type LLMResponse,
  type ContentBlock,
  type Message,
  type TextContent,
  type ImageContent,
  type ToolUseContent,
  type ToolResultContent
} from '../index.js';

export class AnthropicProvider implements ILLMProvider {
  public readonly id = 'anthropic';
  private client: Anthropic;
  private defaultModel: string;

  constructor(options?: { apiKey?: string; baseURL?: string; defaultModel?: string }) {
    this.client = new Anthropic({
      apiKey: options?.apiKey || process.env.ANTHROPIC_API_KEY,
      baseURL: options?.baseURL || process.env.ANTHROPIC_BASE_URL,
    });
    this.defaultModel = options?.defaultModel || process.env.ANTHROPIC_DEFAULT_MODEL || 'claude-sonnet-4-5-thinking';
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    const model = request.model || this.defaultModel;

    // Convert messages to Anthropic format
    const systemMessage = request.system;
    const messages = this.convertMessages(request.messages);

    try {
      const response = await this.client.messages.create({
        model,
        messages,
        system: systemMessage,
        max_tokens: request.max_tokens || 4096,
        temperature: request.temperature,
        stop_sequences: request.stop,
        // tools: request.tools, // TODO: Map tools format
      });

      return this.convertResponse(response);
    } catch (error) {
      // Wrap error
      throw new Error(`Anthropic API error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private convertMessages(messages: Message[]): Anthropic.MessageParam[] {
    return messages.map((msg) => {
      // Map role 'tool' to 'user' for Anthropic (tool results are user messages in Anthropic API)
      const role = msg.role === 'tool' ? 'user' : msg.role;

      // Handle simple string content
      if (typeof msg.content === 'string') {
        return {
          role: role as 'user' | 'assistant',
          content: msg.content,
        };
      }

      // Handle array of content blocks
      return {
        role: role as 'user' | 'assistant',
        content: msg.content.map(block => this.convertContentBlock(block)),
      };
    });
  }

  private convertContentBlock(block: ContentBlock): Anthropic.ContentBlockParam {
    switch (block.type) {
      case 'text':
        return { type: 'text', text: block.text };
      case 'image':
        return {
          type: 'image',
          source: {
            type: 'base64',
            media_type: block.source.media_type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
            data: block.source.data,
          },
        };
      case 'tool_use':
        return {
          type: 'tool_use',
          id: block.id,
          name: block.name,
          input: block.input,
        };
      case 'tool_result':
        // Anthropic expects tool_result as a content block within a user message
        return {
          type: 'tool_result',
          tool_use_id: block.tool_use_id,
          content: typeof block.content === 'string' ? block.content : block.content.map(c => {
            if (c.type === 'text') return { type: 'text', text: c.text };
            if (c.type === 'image') return {
              type: 'image',
              source: {
                type: 'base64',
                media_type: c.source.media_type as any,
                data: c.source.data
              }
            };
            return { type: 'text', text: JSON.stringify(c) }; // Fallback
          }),
          is_error: block.is_error,
        };
      default:
        throw new Error(`Unsupported content block type: ${(block as any).type}`);
    }
  }

  private convertResponse(response: Anthropic.Message): LLMResponse {
    return {
      id: response.id,
      role: response.role,
      model: response.model,
      stop_reason: response.stop_reason,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        total_tokens: response.usage.input_tokens + response.usage.output_tokens,
      },
      content: response.content.map((block) => {
        if (block.type === 'text') {
          return { type: 'text', text: block.text } as TextContent;
        }
        if (block.type === 'tool_use') {
          return {
            type: 'tool_use',
            id: block.id,
            name: block.name,
            input: block.input as Record<string, unknown>,
          } as ToolUseContent;
        }
        if (block.type === 'thinking') {
          return {
            type: 'thinking',
            thinking: (block as any).thinking,
            signature: (block as any).signature,
          };
        }
        throw new Error(`Unknown response content type: ${(block as any).type}`);
      }),
    };
  }
}
