
import { z } from 'zod';
import type { ILLMProvider, LLMRequest } from '../llm/index.js';
import type { Task, Step, IntentProfile, AgentContext } from './index.js';
import type { Skill } from '../skills/types.js';
import type { Fact, Episode } from '../memory/index.js';
import type { StrategyConfig } from './strategy.js';

const PlanSchema = z.object({
  steps: z.array(z.object({
    type: z.enum(['thought', 'action', 'system']),
    description: z.string(),
    tool: z.string().optional(),
    args: z.record(z.unknown()).optional(),
    dependsOn: z.array(z.union([z.string(), z.number()])).optional(),
    riskLevel: z.enum(['low', 'medium', 'high']).optional(),
    requiresConfirmation: z.boolean().optional(),
    verification: z.array(z.string()).optional(),
  }))
});

const HIGH_RISK_TOOLS = new Set([
  'shell_execute',
  'fs_write_file',
  'fs_delete_file',
  'fs_delete_directory',
  'fs_move',
  'fs_copy',
  'git_push'
]);

const MEDIUM_RISK_PREFIXES = ['fs_', 'git_'];

export class SimplePlanner {
  private llm: ILLMProvider;
  private config: StrategyConfig;

  constructor(llm: ILLMProvider, config: StrategyConfig) {
    this.llm = llm;
    this.config = config;
  }

  private fillTemplate(template: string, variables: Record<string, string>): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
      const val = variables[key.trim()];
      return val !== undefined ? val : `{{${key}}}`; // Keep allow missing vars? or empty?
    });
  }

  async createPlan(task: Task, intent: IntentProfile, context: AgentContext, skills: Skill[] = [], memories: { facts: Fact[], episodes: Episode[] } = { facts: [], episodes: [] }): Promise<Step[]> {
    let skillContext = '';
    if (skills.length > 0) {
      skillContext = `\nRELEVANT SKILLS (Follow these instructions):\n${skills.map(s => `--- SKILL: ${s.name} ---\n${s.content}\n--- END SKILL ---`).join('\n')}\n`;
    }

    let memoryContext = '';
    if (memories.facts.length > 0 || memories.episodes.length > 0) {
      memoryContext = '\nRELEVANT MEMORIES (Use this context to inform your plan):\n';
      if (memories.facts.length > 0) {
        memoryContext += `Facts/Preferences:\n${memories.facts.map(f => `- ${f.content}`).join('\n')}\n`;
      }
      if (memories.episodes.length > 0) {
        memoryContext += `Past Similar Episodes:\n${memories.episodes.map(e => `- User Input: "${e.input}" -> Successful Result: ${e.result.substring(0, 100)}...`).join('\n')}\n`;
      }
    }

    // Default tools list (hardcoded for now as placeholders, ideally passed from Agent)
    const predefinedTools = `
    - shell_execute: Execute shell commands. USE CAUTION. (args: { command: string })
    - fs_read_file: Read file content (args: { path: string })
    - fs_write_file: Write file content (args: { path: string, content: string })
    - fs_list_directory: List files and directories (args: { path: string })
    - git_*: Git operations (status, add, commit, etc)
    - remember: Store persistent info (args: { content: string, key?: string })
    - recall: Search memory (args: { query: string })
    - recall: Search memory (args: { query: string })
    - ask_user: Ask user for confirmation or input (args: { prompt: string })
    - analyze_performance: Check recent success rates (args: { limit?: number })
    - propose_strategy_update: Propose strategy changes (args: { analysis: string, description: string, modifications: string })
    `;

    const toolList = context.taskContext?.tools?.length
      ? context.taskContext.tools.map((tool) => `- ${tool}`).join('\n')
      : predefinedTools;

    const taskContextJson = context.taskContext ? JSON.stringify(context.taskContext, null, 2) : '';
    const taskContextSection = taskContextJson
      ? `\nTASK CONTEXT (use for constraints, tools, and environment):\n${taskContextJson}\n`
      : '';

    // Use prompt from strategy or fallback
    const template = this.config.prompts?.planning || `
    You are a strategic planner.
    User Request: "{{task.description}}"
    Intent: {{intent}}
    {{skillContext}}
    {{memoryContext}}
    Available Tools:
    {{tools}}
    {{taskContext}}
    Requirements:
    - Every step should include dependsOn (use step numbers, e.g. 1, 2).
    - Each action step must include verification (how to confirm success).
    - Provide riskLevel: low | medium | high.
    - Set requiresConfirmation for high-risk actions.
    Create a JSON plan.
    `;

    const systemPrompt = this.fillTemplate(template, {
      'task.description': task.description,
      'intent': JSON.stringify(intent),
      'skillContext': skillContext,
      'memoryContext': memoryContext,
      'tools': toolList,
      'taskContext': taskContextSection,
      'cwd': 'Current Working Directory', // Placeholder
      'lastResult': 'Output of previous step' // Placeholder
    });

    const requirements = `
    Requirements:
    - Every step should include dependsOn (use step numbers, e.g. 1, 2).
    - Each action step must include verification (how to confirm success).
    - Provide riskLevel: low | medium | high.
    - Set requiresConfirmation for high-risk actions.
    `;

    const finalSystemPrompt = `${systemPrompt}\n${requirements}\n${taskContextSection}`;


    const request: LLMRequest = {
      system: finalSystemPrompt,
      messages: [{ role: 'user', content: "Create a plan for this task." }],
      temperature: this.config.planning?.temperature ?? 0.2
    };

    const response = await this.llm.generate(request);
    const content = response.content.find(c => c.type === 'text');

    if (!content || content.type !== 'text') {
      throw new Error('Failed to get text plan from LLM');
    }

    try {
      const jsonStr = content.text.replace(/```json\n?|\n?```/g, '').trim();
      const parsed = JSON.parse(jsonStr);
      const plan = PlanSchema.parse(parsed);

      const stepIds = plan.steps.map((_, index) => `step-${task.id}-${index + 1}`);

      const resolveDependsOn = (entry: string | number): string | null => {
        if (typeof entry === 'number') {
          const idx = Math.floor(entry) - 1;
          if (idx >= 0 && idx < stepIds.length) return stepIds[idx];
          return null;
        }
        const trimmed = entry.trim().toLowerCase();
        if (trimmed === 'prev' || trimmed === 'previous') {
          return null;
        }
        const numeric = Number(trimmed.replace(/^step-/, ''));
        if (!Number.isNaN(numeric) && Number.isFinite(numeric)) {
          const idx = Math.floor(numeric) - 1;
          if (idx >= 0 && idx < stepIds.length) return stepIds[idx];
        }
        return entry;
      };

      const inferRisk = (tool?: string): 'low' | 'medium' | 'high' => {
        if (!tool) return 'low';
        if (HIGH_RISK_TOOLS.has(tool)) return 'high';
        if (MEDIUM_RISK_PREFIXES.some(prefix => tool.startsWith(prefix))) return 'medium';
        return 'low';
      };

      const steps = plan.steps.map((s, index) => {
        const rawDependsOn = Array.isArray(s.dependsOn) ? s.dependsOn : [];
        const resolvedDependsOn = rawDependsOn
          .map(entry => resolveDependsOn(entry))
          .filter((value): value is string => Boolean(value));

        const dependsOn = resolvedDependsOn.length > 0
          ? resolvedDependsOn
          : (index > 0 ? [stepIds[index - 1]] : []);

        const riskLevel = s.riskLevel ?? inferRisk(s.tool);
        const requiresConfirmation = s.requiresConfirmation ?? (riskLevel === 'high');
        const verification = s.verification && s.verification.length > 0
          ? s.verification
          : (s.type === 'action' ? ['Validate tool output for this step.'] : []);

        return {
          id: stepIds[index],
          taskId: task.id,
          status: 'pending' as const,
          type: s.type,
          description: s.description,
          tool: s.tool,
          args: s.args,
          dependsOn,
          riskLevel,
          requiresConfirmation,
          verification,
        };
      });

      const hasVerification = steps.some(step => Array.isArray(step.verification) && step.verification.length > 0);
      if (!hasVerification) {
        const verifyStepId = `step-${task.id}-${steps.length + 1}`;
        steps.push({
          id: verifyStepId,
          taskId: task.id,
          status: 'pending' as const,
          type: 'system',
          description: 'Verify outputs and confirm task success.',
          dependsOn: steps.length > 0 ? [steps[steps.length - 1].id] : [],
          riskLevel: 'low',
          requiresConfirmation: false,
          verification: ['Review outputs for correctness.']
        });
      }

      // Convert to full Step objects
      return steps;

    } catch (error) {
      console.error('Failed to parse plan:', content.text);
      // Fallback: Single generic thought step
      return [{
        id: `step-${task.id}-fallback`,
        taskId: task.id,
        type: 'thought',
        status: 'pending',
        description: 'Analyze the request manually (Planning failed)',
        dependsOn: [],
        riskLevel: 'low',
        requiresConfirmation: false,
        verification: [],
      }];
    }
  }
}
