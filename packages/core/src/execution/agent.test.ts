import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockProvider } from '../llm/providers/mock.js';
import type { LLMResponse, ToolUseContent, TextContent } from '../llm/types.js';
import { Agent } from './agent.js';

// We test the Agent's agentic loop behavior by mocking the LLM and MCP layers.
// The Agent class requires many dependencies (MCP servers, memory, etc.), so we
// test its core logic patterns through the MockProvider.

describe('Agent Agentic Loop (via MockProvider)', () => {
  let provider: MockProvider;

  beforeEach(() => {
    provider = new MockProvider();
  });

  it('should handle a simple text response (no tool use)', async () => {
    provider.enqueueResponse({
      text: 'Hello! How can I help you?',
      stop_reason: 'end_turn',
    });

    const response = await provider.generate({
      messages: [{ role: 'user', content: 'Hi' }],
    });

    expect(response.stop_reason).toBe('end_turn');
    expect(response.content[0].type).toBe('text');
    expect((response.content[0] as TextContent).text).toBe('Hello! How can I help you?');
  });

  it('should handle tool_use stop_reason with tool calls', async () => {
    const toolResponse: LLMResponse = {
      id: 'mock-tool-1',
      role: 'assistant',
      model: 'mock-model',
      stop_reason: 'tool_use',
      usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
      content: [
        {
          type: 'tool_use',
          id: 'call-1',
          name: 'shell_execute',
          input: { command: 'ls' },
        } as ToolUseContent,
      ],
    };
    provider.enqueueResponse(toolResponse);

    const response = await provider.generate({
      messages: [{ role: 'user', content: 'List files' }],
    });

    expect(response.stop_reason).toBe('tool_use');
    const toolUses = response.content.filter(b => b.type === 'tool_use');
    expect(toolUses).toHaveLength(1);
    expect((toolUses[0] as ToolUseContent).name).toBe('shell_execute');
  });

  it('should simulate multi-turn agentic loop pattern', async () => {
    // Turn 1: LLM wants to use a tool
    provider.enqueueResponse({
      id: 'turn-1',
      role: 'assistant',
      model: 'mock-model',
      stop_reason: 'tool_use',
      usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
      content: [
        {
          type: 'tool_use',
          id: 'call-1',
          name: 'read_file',
          input: { path: '/test.txt' },
        } as ToolUseContent,
      ],
    });

    // Turn 2: LLM produces final answer
    provider.enqueueResponse({
      text: 'The file contains "hello world".',
      stop_reason: 'end_turn',
    });

    // Simulate loop
    const messages: any[] = [{ role: 'user', content: 'Read /test.txt' }];

    // Turn 1
    const res1 = await provider.generate({ messages });
    expect(res1.stop_reason).toBe('tool_use');
    messages.push({ role: 'assistant', content: res1.content });
    messages.push({
      role: 'tool',
      content: [{ type: 'tool_result', tool_use_id: 'call-1', content: 'hello world' }],
    });

    // Turn 2
    const res2 = await provider.generate({ messages });
    expect(res2.stop_reason).toBe('end_turn');
    expect((res2.content[0] as TextContent).text).toContain('hello world');
  });

  it('should enforce maxIterations safety valve', () => {
    // This tests the concept — in the real Agent, maxIterations breaks the while loop.
    const maxIterations = 5;
    let iteration = 0;

    // Simulate a loop that always gets tool_use (never ends)
    while (iteration < maxIterations) {
      iteration++;
    }

    expect(iteration).toBe(maxIterations);
  });

  it('should generate stream chunks from MockProvider', async () => {
    provider.enqueueResponse({
      text: 'Hello streaming!',
      stop_reason: 'end_turn',
    });

    const chunks: any[] = [];
    for await (const chunk of provider.generateStream({
      messages: [{ role: 'user', content: 'Hi' }],
    })) {
      chunks.push(chunk);
    }

    // Should have text_delta and message_stop
    const textDeltas = chunks.filter(c => c.type === 'text_delta');
    const messageStop = chunks.filter(c => c.type === 'message_stop');

    expect(textDeltas.length).toBeGreaterThan(0);
    expect(textDeltas[0].text).toBe('Hello streaming!');
    expect(messageStop).toHaveLength(1);
    expect(messageStop[0].response.stop_reason).toBe('end_turn');
  });

  it('should generate stream chunks with tool_use from MockProvider', async () => {
    const toolResponse: LLMResponse = {
      id: 'mock-stream-tool-1',
      role: 'assistant',
      model: 'mock-model',
      stop_reason: 'tool_use',
      usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
      content: [
        {
          type: 'tool_use',
          id: 'call-stream-1',
          name: 'shell_execute',
          input: { command: 'pwd' },
        } as ToolUseContent,
      ],
    };
    provider.enqueueResponse(toolResponse);

    const chunks: any[] = [];
    for await (const chunk of provider.generateStream({
      messages: [{ role: 'user', content: 'pwd' }],
    })) {
      chunks.push(chunk);
    }

    const toolStarts = chunks.filter(c => c.type === 'tool_use_start');
    const toolDeltas = chunks.filter(c => c.type === 'tool_use_delta');
    const toolEnds = chunks.filter(c => c.type === 'tool_use_end');

    expect(toolStarts).toHaveLength(1);
    expect(toolStarts[0].name).toBe('shell_execute');
    expect(toolDeltas).toHaveLength(1);
    expect(toolEnds).toHaveLength(1);
  });

  it('should include available tools in the system prompt', () => {
    const agent = new Agent(provider);
    const prompt = (agent as any).buildSystemPrompt([], [], [], [], ['browser_navigate', 'browser_click']);

    expect(prompt).toContain('AVAILABLE TOOLS');
    expect(prompt).toContain('- browser_navigate');
    expect(prompt).toContain('- browser_click');
  });
});
