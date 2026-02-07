import type { ILLMProvider, LLMRequest, LLMResponse } from '../../llm/index.js';

export class ReplayLLMProvider implements ILLMProvider {
  private originalPlan: string;
  private callCount = 0;

  constructor(originalPlan: string) {
    this.originalPlan = originalPlan;
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    this.callCount += 1;
    const isPlanning = request.system?.includes('strategic planner');
    if (isPlanning) {
      return {
        content: [
          {
            type: 'text',
            text: `\`\`\`json\n${this.originalPlan}\n\`\`\``
          }
        ]
      };
    }

    // For non-planning calls, return a minimal deterministic response to keep replay flowing.
    return {
      content: [
        {
          type: 'text',
          text: `{"note":"replay-mock","call":${this.callCount}}`
        }
      ]
    };
  }
}
