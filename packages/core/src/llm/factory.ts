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
  const openaiApiKey = config.llm?.openaiApiKey || process.env.OPENAI_API_KEY || '';
  const anthropicApiKey = config.llm?.anthropicApiKey || process.env.ANTHROPIC_API_KEY || '';
  const openaiBaseUrl = config.llm?.openaiBaseUrl || process.env.OPENAI_BASE_URL || '';
  const anthropicBaseUrl = config.llm?.anthropicBaseUrl || process.env.ANTHROPIC_BASE_URL || '';
  const ollamaBaseUrl = config.llm?.ollamaBaseUrl || process.env.OLLAMA_BASE_URL || '';
  const fallbackOrder = Array.isArray(config.llm?.fallbackOrder) && config.llm.fallbackOrder.length > 0
    ? config.llm.fallbackOrder
    : ['ollama', 'openai', 'anthropic'];

  const createSingle = (name: string, strict: boolean): ILLMProvider | null => {
    if (name === 'mock') {
      return new MockProvider();
    }
    if (name === 'ollama') {
      return new OllamaProvider({ defaultModel, baseURL: ollamaBaseUrl || undefined });
    }
    if (name === 'openai') {
      if (!openaiApiKey) {
        if (strict) throw new Error('OPENAI_API_KEY is not set.');
        return null;
      }
      return new OpenAIProvider({
        apiKey: openaiApiKey,
        baseURL: openaiBaseUrl || undefined,
        defaultModel,
      });
    }
    if (name === 'anthropic') {
      if (!anthropicApiKey) {
        if (strict) throw new Error('ANTHROPIC_API_KEY is not set.');
        return null;
      }
      return new AnthropicProvider({
        apiKey: anthropicApiKey,
        baseURL: anthropicBaseUrl || undefined,
        defaultModel,
      });
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
        'No available LLM providers. Configure provider API keys (config or env), or ensure Ollama is available.'
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
