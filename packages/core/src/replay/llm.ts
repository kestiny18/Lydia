import type { ILLMProvider, LLMRequest, LLMResponse } from '../llm/index.js';

export class ReplayLLMProvider implements ILLMProvider {
  public readonly id = 'replay';
  private originalPlan: string;
  private callCount = 0;

  constructor(originalPlan: string) {
    this.originalPlan = this.normalizePlan(originalPlan);
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    this.callCount += 1;
    const systemPrompt = request.system || '';
    const isPlanning = systemPrompt.includes('strategic planner');
    const isIntent = systemPrompt.includes('intent analysis') || systemPrompt.includes('intent analysis engine');
    if (isPlanning) {
      return {
        id: `replay-${this.callCount}`,
        role: 'assistant',
        model: 'replay',
        stop_reason: 'end_turn',
        usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
        content: [
          {
            type: 'text',
            text: `\`\`\`json\n${this.originalPlan}\n\`\`\``
          }
        ]
      };
    }

    if (isIntent) {
      const summary = request.messages?.[0]?.content?.toString?.() || 'replay intent';
      return {
        id: `replay-${this.callCount}`,
        role: 'assistant',
        model: 'replay',
        stop_reason: 'end_turn',
        usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              category: 'action',
              summary,
              entities: [],
              complexity: 'simple',
              goal: summary,
              deliverables: [],
              constraints: [],
              successCriteria: [],
              assumptions: [],
              requiredTools: []
            })
          }
        ]
      };
    }

    // For non-planning calls, return a minimal deterministic response to keep replay flowing.
    return {
      id: `replay-${this.callCount}`,
      role: 'assistant',
      model: 'replay',
      stop_reason: 'end_turn',
      usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
      content: [
        {
          type: 'text',
          text: `{"note":"replay-mock","call":${this.callCount}}`
        }
      ]
    };
  }

  private normalizePlan(plan: string): string {
    try {
      const parsed = JSON.parse(plan);
      if (Array.isArray(parsed)) {
        return JSON.stringify({ steps: parsed });
      }
      if (parsed && typeof parsed === 'object' && Array.isArray((parsed as any).steps)) {
        return JSON.stringify(parsed);
      }
      return JSON.stringify({ steps: [] });
    } catch {
      return JSON.stringify({ steps: [] });
    }
  }
}
