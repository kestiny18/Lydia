import type { ILLMProvider, LLMRequest, LLMResponse } from '../../llm/index.js';

export class ReplayLLMProvider implements ILLMProvider {
  private originalPlan: string;

  constructor(originalPlan: string) {
    this.originalPlan = originalPlan;
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    // In Replay mode, we ignore the prompt and return the original plan deterministically.
    // This assumes the prompt is for planning. If we had other LLM calls (e.g. Intent),
    // we would need a more sophisticated mock or store intent in traces too.
    // For MVP, we assume 1 LLM call per task (the plan).
    return {
      content: [
        {
          type: 'text',
          text: `\`\`\`json\n${this.originalPlan}\n\`\`\``
        }
      ]
    };
  }
}
