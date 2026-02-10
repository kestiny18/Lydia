import OpenAI from 'openai';
import {
  type ILLMProvider,
  type LLMRequest,
  type LLMResponse,
  type ContentBlock,
  type Message,
  type StreamChunk,
  type TextContent,
  type ToolUseContent
} from '../index.js';

type OpenAIMessageParam = OpenAI.Chat.Completions.ChatCompletionMessageParam;
type OpenAIContentPart = OpenAI.Chat.Completions.ChatCompletionContentPart;
type OpenAIToolCall = OpenAI.Chat.Completions.ChatCompletionMessageToolCall;

export class OpenAIProvider implements ILLMProvider {
  public readonly id = 'openai';
  private client: OpenAI;
  private defaultModel: string;

  constructor(options?: { apiKey?: string; baseURL?: string; defaultModel?: string }) {
    this.client = new OpenAI({
      apiKey: options?.apiKey || process.env.OPENAI_API_KEY,
      baseURL: options?.baseURL || process.env.OPENAI_BASE_URL,
    });
    this.defaultModel = options?.defaultModel || process.env.OPENAI_DEFAULT_MODEL || 'gpt-4o-mini';
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    const model = request.model || this.defaultModel;
    const messages = this.convertMessages(request.messages, request.system);

    try {
      const createParams: any = {
        model,
        messages,
        max_tokens: request.max_tokens,
        temperature: request.temperature,
        stop: request.stop,
      };

      // Map ToolDefinition[] to OpenAI function calling format
      if (request.tools && request.tools.length > 0) {
        createParams.tools = request.tools.map(t => ({
          type: 'function' as const,
          function: {
            name: t.name,
            description: t.description || '',
            parameters: t.inputSchema,
          },
        }));
      }

      const response = await this.client.chat.completions.create(createParams);

      const choice = response.choices[0];
      if (!choice?.message) {
        throw new Error('OpenAI API returned no message.');
      }

      return this.convertResponse(response, choice.message, choice.finish_reason || null);
    } catch (error) {
      throw new Error(`OpenAI API error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async *generateStream(request: LLMRequest): AsyncGenerator<StreamChunk, void, unknown> {
    const model = request.model || this.defaultModel;
    const messages = this.convertMessages(request.messages, request.system);

    const createParams: any = {
      model,
      messages,
      max_tokens: request.max_tokens,
      temperature: request.temperature,
      stop: request.stop,
      stream: true,
    };

    if (request.tools && request.tools.length > 0) {
      createParams.tools = request.tools.map(t => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description || '',
          parameters: t.inputSchema,
        },
      }));
    }

    try {
      const stream = await this.client.chat.completions.create(createParams);

      // Accumulated state for building final response
      let responseId = '';
      let responseModel = model;
      let finishReason: string | null = null;
      const usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };
      let accumulatedText = '';
      const toolCalls: Map<number, { id: string; name: string; arguments: string }> = new Map();

      for await (const chunk of stream as any) {
        responseId = chunk.id || responseId;
        responseModel = chunk.model || responseModel;

        if (chunk.usage) {
          usage.input_tokens = chunk.usage.prompt_tokens || 0;
          usage.output_tokens = chunk.usage.completion_tokens || 0;
          usage.total_tokens = chunk.usage.total_tokens || 0;
        }

        const choice = chunk.choices?.[0];
        if (!choice) continue;

        if (choice.finish_reason) {
          finishReason = choice.finish_reason;
        }

        const delta = choice.delta;
        if (!delta) continue;

        // Text delta
        if (delta.content) {
          accumulatedText += delta.content;
          yield { type: 'text_delta', text: delta.content };
        }

        // Tool call deltas
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            if (!toolCalls.has(idx)) {
              toolCalls.set(idx, { id: tc.id || '', name: tc.function?.name || '', arguments: '' });
              if (tc.id) {
                yield { type: 'tool_use_start', id: tc.id, name: tc.function?.name || '' };
              }
            }
            const existing = toolCalls.get(idx)!;
            if (tc.id) existing.id = tc.id;
            if (tc.function?.name) existing.name = tc.function.name;
            if (tc.function?.arguments) {
              existing.arguments += tc.function.arguments;
              yield { type: 'tool_use_delta', id: existing.id, input_json: tc.function.arguments };
            }
          }
        }
      }

      // Emit tool_use_end for all tool calls
      for (const [, tc] of toolCalls) {
        if (tc.id) {
          yield { type: 'tool_use_end', id: tc.id };
        }
      }

      // Build final content blocks
      const content: ContentBlock[] = [];
      if (accumulatedText) {
        content.push({ type: 'text', text: accumulatedText } as TextContent);
      }
      for (const [, tc] of toolCalls) {
        let input: Record<string, unknown> = {};
        try { input = JSON.parse(tc.arguments || '{}'); } catch { input = { raw: tc.arguments }; }
        content.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input,
        } as ToolUseContent);
      }

      yield {
        type: 'message_stop',
        response: {
          id: responseId,
          role: 'assistant',
          model: responseModel,
          stop_reason: this.mapStopReason(finishReason),
          usage,
          content,
        },
      };
    } catch (error) {
      yield { type: 'error', error: `OpenAI streaming error: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  private convertMessages(messages: Message[], system?: string): OpenAIMessageParam[] {
    const output: OpenAIMessageParam[] = [];

    if (system) {
      output.push({ role: 'system', content: system });
    }

    for (const msg of messages) {
      if (msg.role === 'tool') {
        const toolResult = this.extractToolResult(msg.content);
        output.push({
          role: 'tool',
          tool_call_id: toolResult?.tool_use_id || 'unknown',
          content: toolResult ? this.normalizeToolResultContent(toolResult.content) : '',
        });
        continue;
      }

      const converted = this.convertMessageContent(msg.content);
      const role = msg.role as 'user' | 'assistant' | 'system';
      if (converted.toolCalls && role !== 'assistant') {
        // Tool calls are only valid on assistant messages.
        output.push({ role, content: converted.content ?? '' } as OpenAIMessageParam);
        continue;
      }

      if (converted.toolCalls) {
        output.push({
          role: 'assistant' as const,
          content: converted.content,
          tool_calls: converted.toolCalls,
        } as OpenAIMessageParam);
      } else {
        output.push({ role, content: converted.content ?? '' } as OpenAIMessageParam);
      }
    }

    return output;
  }

  private convertMessageContent(content: Message['content']): { content: string | OpenAIContentPart[] | null; toolCalls?: OpenAIToolCall[] } {
    if (typeof content === 'string') {
      return { content };
    }

    const parts: OpenAIContentPart[] = [];
    const toolCalls: OpenAIToolCall[] = [];

    for (const block of content) {
      if (block.type === 'text') {
        parts.push({ type: 'text', text: block.text });
        continue;
      }
      if (block.type === 'image') {
        const url = `data:${block.source.media_type};base64,${block.source.data}`;
        parts.push({ type: 'image_url', image_url: { url } });
        continue;
      }
      if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          type: 'function',
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input ?? {}),
          },
        });
      }
    }

    const contentValue = parts.length > 0 ? parts : null;
    return toolCalls.length > 0 ? { content: contentValue, toolCalls } : { content: contentValue };
  }

  private extractToolResult(content: Message['content']) {
    if (typeof content === 'string') return null;
    return content.find((block) => block.type === 'tool_result') as
      | { tool_use_id: string; content: unknown }
      | null;
  }

  private normalizeToolResultContent(content: unknown): string {
    if (typeof content === 'string') return content;
    try {
      return JSON.stringify(content);
    } catch {
      return String(content);
    }
  }

  private convertResponse(
    response: OpenAI.Chat.Completions.ChatCompletion,
    message: OpenAI.Chat.Completions.ChatCompletionMessage,
    finishReason: string | null
  ): LLMResponse {
    const content: ContentBlock[] = [];

    if (message.content) {
      content.push({ type: 'text', text: message.content } as TextContent);
    }

    if (Array.isArray(message.tool_calls)) {
      for (const call of message.tool_calls) {
        let input: Record<string, unknown> = {};
        if (call.type === 'function') {
          try {
            input = JSON.parse(call.function.arguments || '{}');
          } catch {
            input = { raw: call.function.arguments };
          }
        }

        content.push({
          type: 'tool_use',
          id: call.id,
          name: call.type === 'function' ? call.function.name : 'tool_call',
          input,
        } as ToolUseContent);
      }
    }

    return {
      id: response.id,
      role: (message.role || 'assistant') as LLMResponse['role'],
      model: response.model,
      stop_reason: this.mapStopReason(finishReason),
      usage: {
        input_tokens: response.usage?.prompt_tokens ?? 0,
        output_tokens: response.usage?.completion_tokens ?? 0,
        total_tokens: response.usage?.total_tokens ?? 0,
      },
      content,
    };
  }

  private mapStopReason(reason: string | null): LLMResponse['stop_reason'] {
    switch (reason) {
      case 'stop':
        return 'end_turn';
      case 'length':
        return 'max_tokens';
      case 'tool_calls':
        return 'tool_use';
      default:
        return null;
    }
  }
}
