import { z } from 'zod';

export const StrategySchema = z.object({
  id: z.string(),
  version: z.string(),
  name: z.string(),
  description: z.string().optional(),
  preferences: z.record(z.unknown()).default({}),
  constraints: z.record(z.unknown()).default({}),
  evolution_limits: z.record(z.unknown()).default({}),
});

export type Strategy = z.infer<typeof StrategySchema>;
