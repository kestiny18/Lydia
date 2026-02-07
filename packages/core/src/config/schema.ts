import { z } from 'zod';

export const McpServerSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).default([]),
  env: z.record(z.string()).optional(),
});

export const ConfigSchema = z.object({
  mcpServers: z.record(McpServerSchema).default({}),
  safety: z.object({
    userDataDirs: z.array(z.string()).default([]),
    systemDirs: z.array(z.string()).default([]),
    allowPaths: z.array(z.string()).default([]),
    denyPaths: z.array(z.string()).default([]),
    rememberApprovals: z.boolean().default(true),
  }).default({}),
});

export type LydiaConfig = z.infer<typeof ConfigSchema>;
