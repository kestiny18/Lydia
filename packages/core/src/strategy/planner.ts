import { z } from 'zod';
import type { ILLMProvider, LLMRequest } from '../llm/index.js';
import type { Task, Step, Intent, AgentContext } from './index.js';
import type { Skill } from '../skills/types.js';
import type { Fact, Episode } from '../memory/index.js';

const PlanSchema = z.object({
  steps: z.array(z.object({
    type: z.enum(['thought', 'action', 'system']),
    description: z.string(),
    tool: z.string().optional(),
    args: z.record(z.unknown()).optional()
  }))
});

export class SimplePlanner {
  private llm: ILLMProvider;

  constructor(llm: ILLMProvider) {
    this.llm = llm;
  }

  async createPlan(task: Task, intent: Intent, context: AgentContext, skills: Skill[] = [], memories: { facts: Fact[], episodes: Episode[] } = { facts: [], episodes: [] }): Promise<Step[]> {
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

    const systemPrompt = `
    You are a strategic planner for an AI Agent.
    Your goal is to break down a user's request into executable steps.

    User Request: "${task.description}"
    Intent: ${JSON.stringify(intent)}
    ${skillContext}
    ${memoryContext}
    Available Tools:
    - shell_execute: Execute shell commands. USE CAUTION. (args: { command: string })
    - fs_read_file: Read file content (args: { path: string })
    - fs_write_file: Write file content (args: { path: string, content: string })
    - fs_list_directory: List files and directories (args: { path: string })
    - git_*: Git operations (status, add, commit, etc)
    - remember: Store persistent info (args: { content: string, key?: string })
    - recall: Search memory (args: { query: string })
    - ask_user: Ask user for confirmation or input (args: { prompt: string })

    Context Variables:
    - {{cwd}}: Current working directory (absolute path)
    - {{lastResult}}: Output of the previous step
    - Use these variables in arguments to pass data between steps.

    Output format: JSON object with a "steps" array.
    Each step must have:
    - type: "thought" | "action"
    - description: Clear explanation of the step
    - tool: (Optional, only for "action") Tool name
    - args: (Optional, only for "action") Tool arguments

    Example:
    {
      "steps": [
        { "type": "thought", "description": "Check current directory" },
        { "type": "action", "description": "Get CWD", "tool": "shell_execute", "args": { "command": "pwd" } },
        { "type": "action", "description": "List files", "tool": "fs_list_directory", "args": { "path": "{{lastResult}}" } }
      ]
    }
    `;

    const request: LLMRequest = {
      system: systemPrompt,
      messages: [{ role: 'user', content: "Create a plan for this task." }],
      temperature: 0.2
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

      // Convert to full Step objects
      return plan.steps.map((s, index) => ({
        id: `step-${Date.now()}-${index}`,
        taskId: task.id,
        status: 'pending',
        type: s.type,
        description: s.description,
        tool: s.tool,
        args: s.args,
      }));

    } catch (error) {
      console.error('Failed to parse plan:', content.text);
      // Fallback: Single generic thought step
      return [{
        id: `step-${Date.now()}-fallback`,
        taskId: task.id,
        type: 'thought',
        status: 'pending',
        description: 'Analyze the request manually (Planning failed)',
      }];
    }
  }
}
