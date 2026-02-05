import { z } from 'zod';
import type { ILLMProvider, LLMRequest } from '../llm/index.js';

export const IntentSchema = z.object({
  category: z.enum(['query', 'action', 'script', 'unknown']),
  summary: z.string().describe('A concise summary of what the user wants'),
  entities: z.array(z.string()).optional().describe('Key entities mentioned (files, libraries, etc.)'),
  complexity: z.enum(['simple', 'medium', 'complex']).describe('Estimated task complexity'),
});

export type Intent = z.infer<typeof IntentSchema>;

export class IntentAnalyzer {
  private llm: ILLMProvider;

  constructor(llm: ILLMProvider) {
    this.llm = llm;
  }

  async analyze(userInput: string): Promise<Intent> {
    const systemPrompt = `
You are an intent analysis engine for an AI Agent named Lydia.
Your job is to analyze user input and extract structured intent information.

Output MUST be a valid JSON object matching this schema:
{
  "category": "query" | "action" | "script" | "unknown",
  "summary": "concise summary",
  "entities": ["entity1", "entity2"],
  "complexity": "simple" | "medium" | "complex"
}

Definitions:
- query: Asking for information, explanation, or search.
- action: Requesting to perform a specific task (coding, file manipulation, etc.).
- script: Requesting to generate or run a script.
- unknown: Cannot determine intent.

Example Input: "Create a React component for a login form"
Example Output:
{
  "category": "action",
  "summary": "Create a React login form component",
  "entities": ["React", "login form"],
  "complexity": "medium"
}
`;

    const request: LLMRequest = {
      system: systemPrompt,
      messages: [
        { role: 'user', content: userInput }
      ],
      // We'll parse JSON, so low temperature is good
      temperature: 0,
    };

    const response = await this.llm.generate(request);
    const content = response.content.find(c => c.type === 'text');

    if (!content || content.type !== 'text') {
      throw new Error('Failed to get text response from LLM for intent analysis');
    }

    try {
      // Basic JSON extraction (handling potential markdown code blocks)
      const jsonStr = content.text.replace(/```json\n?|\n?```/g, '').trim();
      const parsed = JSON.parse(jsonStr);
      return IntentSchema.parse(parsed);
    } catch (error) {
      console.error('Failed to parse intent JSON:', content.text);
      // Fallback intent
      return {
        category: 'unknown',
        summary: userInput,
        complexity: 'medium',
      };
    }
  }
}
