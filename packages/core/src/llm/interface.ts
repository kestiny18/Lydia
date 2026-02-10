import type { LLMRequest, LLMResponse, StreamChunk } from './types.js';

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
   */
  generateStream(request: LLMRequest): AsyncGenerator<StreamChunk, void, unknown>;
}
