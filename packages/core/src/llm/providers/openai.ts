import OpenAI from 'openai';
import {
  type ILLMProvider,
  type LLMRequest,
  type LLMResponse,
  type ContentBlock,
  type Message,
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

  constructor(options?: { apiKey?: string; defaultModel?: string }) {
    this.client = new OpenAI({
      apiKey: options?.apiKey || process.env.OPENAI_API_KEY,
    });
    this.defaultModel = options?.defaultModel || process.env.OPENAI_DEFAULT_MODEL || 'gpt-4o-mini';
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    const model = request.model || this.defaultModel;
    const messages = this.convertMessages(request.messages, request.system);

    try {
      const response = await this.client.chat.completions.create({
        model,
        messages,
        max_tokens: request.max_tokens,
        temperature: request.temperature,
        stop: request.stop,
        tools: request.tools,
      });

      const choice = response.choices[0];
      if (!choice?.message) {
        throw new Error('OpenAI API returned no message.');
      }

      return this.convertResponse(response, choice.message, choice.finish_reason || null);
    } catch (error) {
      throw new Error(`OpenAI API error: ${error instanceof Error ? error.message : String(error)}`);
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
        output.push({ role, content: converted.content });
        continue;
      }

      if (converted.toolCalls) {
        output.push({
          role,
          content: converted.content,
          tool_calls: converted.toolCalls,
        });
      } else {
        output.push({ role, content: converted.content });
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
    finishReason: OpenAI.Chat.Completions.ChatCompletionFinishReason | null
  ): LLMResponse {
    const content: ContentBlock[] = [];

    if (typeof message.content === 'string') {
      content.push({ type: 'text', text: message.content } as TextContent);
    } else if (Array.isArray(message.content)) {
      for (const part of message.content) {
        if (part.type === 'text') {
          content.push({ type: 'text', text: part.text } as TextContent);
        }
      }
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

  private mapStopReason(reason: OpenAI.Chat.Completions.ChatCompletionFinishReason | null): LLMResponse['stop_reason'] {
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
