import type { ILLMProvider } from './interface.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { OpenAIProvider } from './providers/openai.js';
import { OllamaProvider } from './providers/ollama.js';
import { MockProvider } from './providers/mock.js';
import { FallbackProvider } from './providers/fallback.js';
import { ConfigLoader } from '../config/loader.js';

export interface CreateLLMOptions {
  /** Override provider choice (default: from config or 'auto') */
  provider?: string;
  /** Override default model */
  model?: string;
}

/**
 * Create an LLM provider based on Lydia's config.
 *
 * Reads `~/.lydia/config.json` for provider settings, API keys come from
 * environment variables. Returns a single provider or a FallbackProvider
 * when `provider` is 'auto'.
 *
 * This is the single source of truth for provider initialization —
 * used by both the Server (dashboard) and CLI.
 */
export async function createLLMFromConfig(options?: CreateLLMOptions): Promise<ILLMProvider> {
  const config = await new ConfigLoader().load();
  const providerChoice = options?.provider || config.llm?.provider || 'auto';
  const defaultModel = options?.model || config.llm?.defaultModel || undefined;
  const fallbackOrder = Array.isArray(config.llm?.fallbackOrder) && config.llm.fallbackOrder.length > 0
    ? config.llm.fallbackOrder
    : ['ollama', 'openai', 'anthropic'];

  const createSingle = (name: string, strict: boolean): ILLMProvider | null => {
    if (name === 'mock') {
      return new MockProvider();
    }
    if (name === 'ollama') {
      return new OllamaProvider({ defaultModel });
    }
    if (name === 'openai') {
      if (!process.env.OPENAI_API_KEY) {
        if (strict) throw new Error('OPENAI_API_KEY is not set.');
        return null;
      }
      return new OpenAIProvider({ defaultModel });
    }
    if (name === 'anthropic') {
      if (!process.env.ANTHROPIC_API_KEY) {
        if (strict) throw new Error('ANTHROPIC_API_KEY is not set.');
        return null;
      }
      return new AnthropicProvider({ defaultModel });
    }
    if (strict) throw new Error(`Unknown LLM provider: ${name}.`);
    return null;
  };

  if (providerChoice === 'auto') {
    const providers = fallbackOrder
      .map((name: string) => createSingle(name, false))
      .filter((p: ILLMProvider | null): p is ILLMProvider => p !== null);
    if (providers.length === 0) {
      throw new Error(
        'No available LLM providers. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or ensure Ollama is available.'
      );
    }
    return providers.length === 1 ? providers[0] : new FallbackProvider(providers);
  }

  const provider = createSingle(providerChoice, true);
  if (!provider) {
    throw new Error(`Failed to initialize LLM provider: ${providerChoice}`);
  }
  return provider;
}
