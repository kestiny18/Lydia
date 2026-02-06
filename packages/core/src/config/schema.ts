import { z } from 'zod';

export const McpServerSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).default([]),
  env: z.record(z.string()).optional(),
});

export const ConfigSchema = z.object({
  mcpServers: z.record(McpServerSchema).default({}),
});

export type LydiaConfig = z.infer<typeof ConfigSchema>;
