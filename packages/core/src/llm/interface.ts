import type { LLMRequest, LLMResponse } from './types.js';

export interface ILLMProvider {
  /**
   * The unique identifier of the provider (e.g., "anthropic", "openai")
   */
  id: string;

  /**
   * Generate a completion for the given messages
   */
  generate(request: LLMRequest): Promise<LLMResponse>;

  /**
   * Generate a stream of completion chunks
   * Note: We'll define the stream chunk type when we implement streaming
   */
  generateStream?(request: LLMRequest): AsyncGenerator<unknown, void, unknown>;
}
