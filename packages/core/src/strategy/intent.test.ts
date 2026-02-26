import { describe, expect, it } from 'vitest';
import { IntentAnalyzer, IntentProfileSchema } from './intent.js';

describe('IntentProfile', () => {
  it('applies defaults for extended intent fields', () => {
    const parsed = IntentProfileSchema.parse({
      category: 'action',
      summary: 'Create a script',
      complexity: 'medium',
    });

    expect(parsed.goal).toBe('');
    expect(parsed.deliverables).toEqual([]);
    expect(parsed.constraints).toEqual([]);
    expect(parsed.successCriteria).toEqual([]);
    expect(parsed.assumptions).toEqual([]);
    expect(parsed.requiredTools).toEqual([]);
  });

  it('falls back to safe profile when llm output is invalid json', async () => {
    const analyzer = new IntentAnalyzer({
      generate: async () => ({
        id: 'bad',
        role: 'assistant',
        model: 'mock',
        stop_reason: 'end_turn',
        usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
        content: [{ type: 'text', text: 'not-json' }],
      }),
      async *generateStream() {
        throw new Error('not used');
      },
    } as any);

    const result = await analyzer.analyze('Summarize this repository.');
    expect(result.category).toBe('unknown');
    expect(result.summary).toBe('Summarize this repository.');
    expect(result.goal).toBe('Summarize this repository.');
  });
});
