import { z } from 'zod';

// ─── Lightweight metadata — always loaded in memory ─────────────────────────
export const SkillMetaSchema = z.object({
  name: z.string(),
  description: z.string(),
  version: z.string().optional(),
  author: z.string().optional(),
  tags: z.array(z.string()).optional(),
  allowedTools: z.array(z.string()).optional(),
  context: z.enum(['main', 'fork']).optional().default('main'),
  path: z.string().optional(), // File path where it was loaded from
}).passthrough(); // Allow extra community fields (license, dependencies, etc.)

export type SkillMeta = z.infer<typeof SkillMetaSchema>;

// ─── Full skill with content (loaded on demand) ─────────────────────────────
export const StaticSkillSchema = SkillMetaSchema.extend({
  content: z.string(), // The markdown body (instructions)
});

export type StaticSkill = z.infer<typeof StaticSkillSchema>;

// ─── Legacy alias — kept for backward compatibility ─────────────────────────
/** @deprecated Use StaticSkillSchema instead */
export const SkillSchema = StaticSkillSchema;

// ─── Dynamic Skill (programmatic with tool execution) ───────────────────────
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
  tags?: string[];
  tools?: {
    name: string;
    description: string;
    inputSchema: any;
  }[];
  execute(toolName: string, args: any, context: SkillContext): Promise<string>;
  // For compatibility with matching logic
  content?: string;
  path?: string;
  allowedTools?: string[];
}

// ─── Union types ────────────────────────────────────────────────────────────
export type Skill = StaticSkill | DynamicSkill;

/** Type guard: check if a skill is a DynamicSkill */
export function isDynamicSkill(skill: Skill | SkillMeta): skill is DynamicSkill {
  return 'execute' in skill && typeof (skill as any).execute === 'function';
}

/** Type guard: check if a skill has content loaded */
export function hasContent(skill: Skill | SkillMeta): skill is StaticSkill | (DynamicSkill & { content: string }) {
  return typeof (skill as any).content === 'string' && (skill as any).content.length > 0;
}

/** Extract content from a skill safely */
export function getSkillContent(skill: Skill | SkillMeta): string {
  return (skill as any).content || '';
}
