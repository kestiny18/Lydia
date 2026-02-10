import { describe, it, expect, beforeEach } from 'vitest';
import { MockProvider } from './providers/mock.js';
import { FallbackProvider } from './providers/fallback.js';
import type { LLMResponse, StreamChunk, ToolUseContent, TextContent } from './types.js';

describe('Streaming Output', () => {
  describe('MockProvider streaming', () => {
    let provider: MockProvider;

    beforeEach(() => {
      provider = new MockProvider();
    });

    it('should yield text_delta for text content', async () => {
      provider.enqueueResponse({ text: 'Hello world' });

      const chunks: StreamChunk[] = [];
      for await (const chunk of provider.generateStream({
        messages: [{ role: 'user', content: 'Hi' }],
      })) {
        chunks.push(chunk);
      }

      const textDeltas = chunks.filter(c => c.type === 'text_delta');
      expect(textDeltas).toHaveLength(1);
      expect((textDeltas[0] as any).text).toBe('Hello world');
    });

    it('should yield message_stop with full response', async () => {
      provider.enqueueResponse({
        text: 'Done',
        stop_reason: 'end_turn',
      });

      const chunks: StreamChunk[] = [];
      for await (const chunk of provider.generateStream({
        messages: [{ role: 'user', content: 'test' }],
      })) {
        chunks.push(chunk);
      }

      const stopChunks = chunks.filter(c => c.type === 'message_stop');
      expect(stopChunks).toHaveLength(1);
      const response = (stopChunks[0] as any).response as LLMResponse;
      expect(response.stop_reason).toBe('end_turn');
      expect(response.content[0].type).toBe('text');
    });

    it('should yield tool_use chunks for tool calls', async () => {
      provider.enqueueResponse({
        id: 'tool-stream-1',
        role: 'assistant',
        model: 'mock-model',
        stop_reason: 'tool_use',
        usage: { input_tokens: 5, output_tokens: 10, total_tokens: 15 },
        content: [
          {
            type: 'tool_use',
            id: 'call-1',
            name: 'shell_execute',
            input: { command: 'echo test' },
          } as ToolUseContent,
        ],
      });

      const chunks: StreamChunk[] = [];
      for await (const chunk of provider.generateStream({
        messages: [{ role: 'user', content: 'run echo' }],
      })) {
        chunks.push(chunk);
      }

      const starts = chunks.filter(c => c.type === 'tool_use_start');
      const deltas = chunks.filter(c => c.type === 'tool_use_delta');
      const ends = chunks.filter(c => c.type === 'tool_use_end');

      expect(starts).toHaveLength(1);
      expect((starts[0] as any).name).toBe('shell_execute');
      expect((starts[0] as any).id).toBe('call-1');

      expect(deltas).toHaveLength(1);
      const inputJson = JSON.parse((deltas[0] as any).input_json);
      expect(inputJson.command).toBe('echo test');

      expect(ends).toHaveLength(1);
      expect((ends[0] as any).id).toBe('call-1');
    });

    it('should handle multiple tool uses in one response', async () => {
      provider.enqueueResponse({
        id: 'multi-tool-1',
        role: 'assistant',
        model: 'mock-model',
        stop_reason: 'tool_use',
        usage: { input_tokens: 5, output_tokens: 10, total_tokens: 15 },
        content: [
          {
            type: 'tool_use',
            id: 'call-a',
            name: 'read_file',
            input: { path: '/a.txt' },
          } as ToolUseContent,
          {
            type: 'tool_use',
            id: 'call-b',
            name: 'read_file',
            input: { path: '/b.txt' },
          } as ToolUseContent,
        ],
      });

      const chunks: StreamChunk[] = [];
      for await (const chunk of provider.generateStream({
        messages: [{ role: 'user', content: 'read both' }],
      })) {
        chunks.push(chunk);
      }

      const starts = chunks.filter(c => c.type === 'tool_use_start');
      expect(starts).toHaveLength(2);
    });

    it('should handle empty queue gracefully', async () => {
      // No response queued — should return default
      const chunks: StreamChunk[] = [];
      for await (const chunk of provider.generateStream({
        messages: [{ role: 'user', content: 'test' }],
      })) {
        chunks.push(chunk);
      }

      const stopChunks = chunks.filter(c => c.type === 'message_stop');
      expect(stopChunks).toHaveLength(1);
    });
  });

  describe('FallbackProvider streaming', () => {
    it('should delegate streaming to first successful provider', async () => {
      const primary = new MockProvider();
      const secondary = new MockProvider();
      const fallback = new FallbackProvider([primary, secondary]);

      primary.enqueueResponse({ text: 'From primary' });

      const chunks: StreamChunk[] = [];
      for await (const chunk of fallback.generateStream({
        messages: [{ role: 'user', content: 'test' }],
      })) {
        chunks.push(chunk);
      }

      const textDeltas = chunks.filter(c => c.type === 'text_delta');
      expect(textDeltas).toHaveLength(1);
      expect((textDeltas[0] as any).text).toBe('From primary');
    });
  });

  describe('StreamChunk type correctness', () => {
    it('should have correct types for all chunk variants', () => {
      const textDelta: StreamChunk = { type: 'text_delta', text: 'hello' };
      const thinkingDelta: StreamChunk = { type: 'thinking_delta', thinking: 'considering...' };
      const toolStart: StreamChunk = { type: 'tool_use_start', id: '1', name: 'test' };
      const toolDelta: StreamChunk = { type: 'tool_use_delta', id: '1', input_json: '{}' };
      const toolEnd: StreamChunk = { type: 'tool_use_end', id: '1' };
      const error: StreamChunk = { type: 'error', error: 'something went wrong' };
      const messageStop: StreamChunk = {
        type: 'message_stop',
        response: {
          id: 'test',
          role: 'assistant',
          model: 'test',
          stop_reason: 'end_turn',
          usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
          content: [],
        },
      };

      // Type assertions — these compile correctly if types are well-defined
      expect(textDelta.type).toBe('text_delta');
      expect(thinkingDelta.type).toBe('thinking_delta');
      expect(toolStart.type).toBe('tool_use_start');
      expect(toolDelta.type).toBe('tool_use_delta');
      expect(toolEnd.type).toBe('tool_use_end');
      expect(error.type).toBe('error');
      expect(messageStop.type).toBe('message_stop');
    });
  });
});
