import type { ILLMProvider } from '../interface.js';
import type { LLMRequest, LLMResponse } from '../types.js';

export class FallbackProvider implements ILLMProvider {
  public readonly id = 'fallback';
  private providers: ILLMProvider[];

  constructor(providers: ILLMProvider[]) {
    if (providers.length === 0) {
      throw new Error('FallbackProvider requires at least one provider.');
    }
    this.providers = providers;
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    const errors: string[] = [];

    for (const provider of this.providers) {
      try {
        return await provider.generate(request);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${provider.id}: ${message}`);
      }
    }

    throw new Error(`All providers failed. ${errors.join(' | ')}`);
  }
}
