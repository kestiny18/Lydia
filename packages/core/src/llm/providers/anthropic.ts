import Anthropic from '@anthropic-ai/sdk';
import {
  type ILLMProvider,
  type LLMRequest,
  type LLMResponse,
  type ContentBlock,
  type Message,
  type StreamChunk,
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
      const createParams: any = {
        model,
        messages,
        system: systemMessage,
        max_tokens: request.max_tokens || 4096,
        temperature: request.temperature,
        stop_sequences: request.stop,
      };

      // Map ToolDefinition[] to Anthropic tools format
      if (request.tools && request.tools.length > 0) {
        createParams.tools = request.tools.map(t => ({
          name: t.name,
          description: t.description || '',
          input_schema: t.inputSchema,
        }));
      }

      const response = await this.client.messages.create(createParams);

      return this.convertResponse(response);
    } catch (error) {
      // Wrap error
      throw new Error(`Anthropic API error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async *generateStream(request: LLMRequest): AsyncGenerator<StreamChunk, void, unknown> {
    const model = request.model || this.defaultModel;
    const messages = this.convertMessages(request.messages);

    const createParams: any = {
      model,
      messages,
      system: request.system,
      max_tokens: request.max_tokens || 4096,
      temperature: request.temperature,
      stop_sequences: request.stop,
      stream: true,
    };

    if (request.tools && request.tools.length > 0) {
      createParams.tools = request.tools.map(t => ({
        name: t.name,
        description: t.description || '',
        input_schema: t.inputSchema,
      }));
    }

    try {
      const stream = await this.client.messages.create(createParams) as any;

      // Accumulated state for building final response
      let responseId = '';
      let responseModel = model;
      let stopReason: LLMResponse['stop_reason'] = null;
      const usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };
      const contentBlocks: ContentBlock[] = [];
      let currentTextParts: string[] = [];
      let currentToolId = '';
      let currentToolName = '';
      let currentToolInput = '';
      let inTextBlock = false;

      for await (const event of stream) {
        const e = event as any;

        if (e.type === 'message_start') {
          responseId = e.message?.id || '';
          responseModel = e.message?.model || model;
          if (e.message?.usage) {
            usage.input_tokens = e.message.usage.input_tokens || 0;
          }
        } else if (e.type === 'content_block_start') {
          const block = e.content_block;
          if (block?.type === 'text') {
            inTextBlock = true;
            currentTextParts = [];
          } else if (block?.type === 'tool_use') {
            currentToolId = block.id;
            currentToolName = block.name;
            currentToolInput = '';
            yield { type: 'tool_use_start', id: currentToolId, name: currentToolName };
          }
        } else if (e.type === 'content_block_delta') {
          const delta = e.delta;
          if (delta?.type === 'text_delta') {
            currentTextParts.push(delta.text);
            yield { type: 'text_delta', text: delta.text };
          } else if (delta?.type === 'thinking_delta') {
            yield { type: 'thinking_delta', thinking: delta.thinking };
          } else if (delta?.type === 'input_json_delta') {
            currentToolInput += delta.partial_json;
            yield { type: 'tool_use_delta', id: currentToolId, input_json: delta.partial_json };
          }
        } else if (e.type === 'content_block_stop') {
          if (inTextBlock) {
            const text = currentTextParts.join('');
            if (text) {
              contentBlocks.push({ type: 'text', text } as TextContent);
            }
            inTextBlock = false;
            currentTextParts = [];
          }
          if (currentToolId) {
            let input: Record<string, unknown> = {};
            try { input = JSON.parse(currentToolInput || '{}'); } catch { input = {}; }
            contentBlocks.push({
              type: 'tool_use',
              id: currentToolId,
              name: currentToolName,
              input,
            } as ToolUseContent);
            yield { type: 'tool_use_end', id: currentToolId };
            currentToolId = '';
            currentToolName = '';
            currentToolInput = '';
          }
        } else if (e.type === 'message_delta') {
          stopReason = e.delta?.stop_reason as LLMResponse['stop_reason'] ?? null;
          if (e.usage) {
            usage.output_tokens = e.usage.output_tokens || 0;
            usage.total_tokens = usage.input_tokens + usage.output_tokens;
          }
        }
      }

      // Yield final response
      yield {
        type: 'message_stop',
        response: {
          id: responseId,
          role: 'assistant',
          model: responseModel,
          stop_reason: stopReason,
          usage,
          content: contentBlocks,
        },
      };
    } catch (error) {
      yield { type: 'error', error: `Anthropic streaming error: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  private convertMessages(messages: Message[]): Anthropic.MessageParam[] {
    const output: Anthropic.MessageParam[] = [];

    for (const msg of messages) {
      // Map role 'tool' to 'user' for Anthropic (tool results are user messages in Anthropic API)
      const role = msg.role === 'tool' ? 'user' : msg.role;

      let content: string | Anthropic.ContentBlockParam[];
      if (typeof msg.content === 'string') {
        content = msg.content;
      } else {
        content = msg.content.map(block => this.convertContentBlock(block));
      }

      // Anthropic requires consecutive tool results to be grouped into a single user message.
      // If this is a tool role message and the last output message is also a user message,
      // merge the content blocks.
      if (msg.role === 'tool' && output.length > 0) {
        const last = output[output.length - 1];
        if (last.role === 'user') {
          // Merge content blocks into the existing user message
          const existingContent = Array.isArray(last.content) ? last.content : [{ type: 'text' as const, text: last.content as string }];
          const newContent = Array.isArray(content) ? content : [{ type: 'text' as const, text: content }];
          last.content = [...existingContent, ...newContent];
          continue;
        }
      }

      output.push({
        role: role as 'user' | 'assistant',
        content,
      });
    }

    return output;
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
      stop_reason: response.stop_reason as LLMResponse['stop_reason'],
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
