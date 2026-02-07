import { describe, it, expect, beforeEach } from 'vitest';
import { MockProvider } from './providers/mock.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { OpenAIProvider } from './providers/openai.js';
import type { LLMRequest } from './types.js';

describe('LLM Core', () => {
  describe('MockProvider', () => {
    let provider: MockProvider;

    beforeEach(() => {
      provider = new MockProvider();
    });

    it('should return queued responses', async () => {
      provider.enqueueResponse({ text: 'Hello, world!' });

      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'Hi' }],
      };

      const response = await provider.generate(request);

      expect(response.content[0].type).toBe('text');
      if (response.content[0].type === 'text') {
        expect(response.content[0].text).toBe('Hello, world!');
      }
      expect(provider.requests).toHaveLength(1);
    });

    it('should handle multiple queued responses', async () => {
      provider.enqueueResponse({ text: 'First' });
      provider.enqueueResponse({ text: 'Second' });

      const request: LLMRequest = { messages: [] };

      const res1 = await provider.generate(request);
      const res2 = await provider.generate(request);

      expect((res1.content[0] as any).text).toBe('First');
      expect((res2.content[0] as any).text).toBe('Second');
    });
  });

  describe('AnthropicProvider', () => {
    // Skip if no API key in environment
    const runIntegration = process.env.ANTHROPIC_API_KEY ? it : it.skip;

    runIntegration('should connect to Anthropic API', async () => {
      const provider = new AnthropicProvider();

      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'Say "test" and nothing else.' }],
        max_tokens: 10,
      };

      const response = await provider.generate(request);

      expect(response.role).toBe('assistant');
      expect(response.content.length).toBeGreaterThan(0);
      const textBlock = response.content.find(c => c.type === 'text');
      expect(textBlock).toBeDefined();
      if (textBlock && textBlock.type === 'text') {
        expect(textBlock.text.toLowerCase()).toContain('test');
      }
    });

    it('should instantiate without error', () => {
      const provider = new AnthropicProvider({ apiKey: 'sk-dummy' });
      expect(provider.id).toBe('anthropic');
    });
  });

  describe('OpenAIProvider', () => {
    it('should instantiate without error', () => {
      const provider = new OpenAIProvider({ apiKey: 'sk-dummy' });
      expect(provider.id).toBe('openai');
    });
  });
});
