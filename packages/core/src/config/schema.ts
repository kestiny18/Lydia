import { z } from 'zod';

export const McpServerSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).default([]),
  env: z.record(z.string()).optional(),
});

export const ConfigSchema = z.object({
  llm: z.object({
    provider: z.enum(['anthropic', 'openai', 'ollama', 'mock', 'auto']).default('auto'),
    defaultModel: z.string().default(''),
    fallbackOrder: z.array(z.enum(['ollama', 'openai', 'anthropic', 'mock'])).default([]),
  }).default({}),
  mcpServers: z.record(McpServerSchema).default({}),
  strategy: z.object({
    activePath: z.string().default(''),
    approvalCooldownDays: z.number().default(7),
    approvalDailyLimit: z.number().default(1),
    replayEpisodes: z.number().default(10),
  }).default({}),
  safety: z.object({
    userDataDirs: z.array(z.string()).default([]),
    systemDirs: z.array(z.string()).default([]),
    allowPaths: z.array(z.string()).default([]),
    denyPaths: z.array(z.string()).default([]),
    rememberApprovals: z.boolean().default(true),
  }).default({}),
});

export type LydiaConfig = z.infer<typeof ConfigSchema>;
