import type { ILLMProvider, LLMRequest, LLMResponse, TextContent } from '../index.js';

export class MockProvider implements ILLMProvider {
  public readonly id = 'mock';
  public requests: LLMRequest[] = [];
  private responseQueue: LLMResponse[] = [];

  /**
   * Queue a mock response to be returned by the next generate call
   */
  enqueueResponse(response: Partial<LLMResponse> & { text?: string }) {
    const fullResponse: LLMResponse = {
      id: response.id || `mock-${Date.now()}`,
      role: response.role || 'assistant',
      model: response.model || 'mock-model',
      stop_reason: response.stop_reason || 'end_turn',
      usage: response.usage || { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
      content: response.content || [{ type: 'text', text: response.text || 'Default mock response' } as TextContent],
    };
    this.responseQueue.push(fullResponse);
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    this.requests.push(request);

    const response = this.responseQueue.shift();
    if (!response) {
      // Default fallback if queue is empty
      return {
        id: 'mock-default',
        role: 'assistant',
        model: 'mock-model',
        stop_reason: 'end_turn',
        usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
        content: [{ type: 'text', text: 'Mock Provider: No response queued.' }],
      };
    }

    return response;
  }

  /**
   * Clear recorded requests and response queue
   */
  clear() {
    this.requests = [];
    this.responseQueue = [];
  }
}
