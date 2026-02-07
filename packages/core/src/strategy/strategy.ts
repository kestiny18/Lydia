
import { z } from 'zod';

export const StrategyMetadataSchema = z.object({
  id: z.string(),
  version: z.string(),
  name: z.string(),
  description: z.string().optional(),
  author: z.string().optional(),
  inheritFrom: z.string().optional(), // For future inheritance
});

export const StrategySystemSchema = z.object({
  role: z.string(),
  personality: z.string().optional(),
  constraints: z.array(z.string()).default([]),
  goals: z.array(z.string()).default([]),
});

export const StrategyPromptsSchema = z.object({
  planning: z.string().optional(), // Template for planning prompt
  reflection: z.string().optional(), // Template for reflection prompt
  intent: z.string().optional(),     // Template for intent analysis
});

export const StrategyPlanningSchema = z.object({
  model: z.string().optional(), // Preferred model for planning
  temperature: z.number().default(0),
  maxSteps: z.number().default(10),
  thinkingProcess: z.boolean().default(true), // Whether to show thought traces
});

export const StrategyExecutionSchema = z.object({
  riskTolerance: z.enum(['low', 'medium', 'high']).default('low'),
  requiresConfirmation: z.array(z.string()).default([]), // List of tools/actions requiring confirmation
  autoRetry: z.boolean().default(true),
  maxRetries: z.number().default(3),
});

export const StrategySchema = z.object({
  metadata: StrategyMetadataSchema,
  system: StrategySystemSchema,
  prompts: StrategyPromptsSchema.optional(),
  planning: StrategyPlanningSchema.optional(),
  execution: StrategyExecutionSchema.optional(),
});

export type Strategy = z.infer<typeof StrategySchema>;
// Alias for backward compatibility or clarity if needed
export type StrategyConfig = Strategy;
