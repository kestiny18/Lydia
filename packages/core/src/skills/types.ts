import { z } from 'zod';

export const SkillSchema = z.object({
  name: z.string(),
  description: z.string(),
  version: z.string().optional(),
  author: z.string().optional(),
  allowedTools: z.array(z.string()).optional(),
  context: z.enum(['main', 'fork']).optional().default('main'),
  content: z.string(), // The markdown body (instructions)
  path: z.string().optional(), // File path where it was loaded from
});

export type SkillContext = {
  agentId?: string;
  taskId?: string;
  // Add more context as needed
};

export interface DynamicSkill {
  name: string;
  description: string;
  version: string;
  author?: string;
  tools?: {
    name: string;
    description: string;
    inputSchema: any;
  }[];
  execute(toolName: string, args: any, context: SkillContext): Promise<string>;
  // For compatibility with matching logic
  content?: string;
  path?: string;
}

export type Skill = z.infer<typeof SkillSchema> | DynamicSkill;

