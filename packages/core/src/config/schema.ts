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
    openaiApiKey: z.string().default(''),
    anthropicApiKey: z.string().default(''),
    openaiBaseUrl: z.string().default(''),
    anthropicBaseUrl: z.string().default(''),
    ollamaBaseUrl: z.string().default(''),
  }).default({}),
  mcpServers: z.record(McpServerSchema).default({}),
  strategy: z.object({
    activePath: z.string().default(''),
    approvalCooldownDays: z.number().default(7),
    approvalDailyLimit: z.number().default(1),
    replayEpisodes: z.number().default(10),
    shadowModeEnabled: z.boolean().default(false),
    shadowTrafficRatio: z.number().min(0).max(1).default(0.1),
    shadowCandidatePaths: z.array(z.string()).default([]),
    autoPromoteEnabled: z.boolean().default(false),
    autoPromoteMinTasks: z.number().default(20),
    autoPromoteMinImprovement: z.number().default(0.05),
    autoPromoteConfidence: z.number().min(0.5).max(0.999).default(0.95),
    shadowWindowDays: z.number().default(14),
  }).default({}),
  safety: z.object({
    userDataDirs: z.array(z.string()).default([]),
    systemDirs: z.array(z.string()).default([]),
    allowPaths: z.array(z.string()).default([]),
    denyPaths: z.array(z.string()).default([]),
    rememberApprovals: z.boolean().default(true),
  }).default({}),
  agent: z.object({
    maxIterations: z.number().default(50),
    intentAnalysis: z.boolean().default(false),
    failureReplan: z.boolean().default(true),
    maxRetries: z.number().default(3),
    retryDelayMs: z.number().default(1000),
    streaming: z.boolean().default(true),
  }).default({}),
  skills: z.object({
    /** Maximum number of skills whose full content is injected into the prompt (default: 3) */
    matchTopK: z.number().default(3),
    /** Enable file system watching for hot-reload of skills (default: true) */
    hotReload: z.boolean().default(true),
    /** Additional directories to scan for skills */
    extraDirs: z.array(z.string()).default([]),
  }).default({}),
});

export type LydiaConfig = z.infer<typeof ConfigSchema>;
