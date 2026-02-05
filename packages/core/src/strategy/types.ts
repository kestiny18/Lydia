import { z } from 'zod';
import type { Message } from '../llm/types.js';

// --- Task Definitions ---

export const TaskStatusSchema = z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TaskSchema = z.object({
  id: z.string(),
  description: z.string(), // Original user request
  createdAt: z.number(),
  status: TaskStatusSchema,
  result: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type Task = z.infer<typeof TaskSchema>;

// --- Step Definitions ---

export const StepTypeSchema = z.enum(['thought', 'action', 'system']);
export type StepType = z.infer<typeof StepTypeSchema>;

export const StepStatusSchema = z.enum(['pending', 'running', 'completed', 'failed', 'skipped']);
export type StepStatus = z.infer<typeof StepStatusSchema>;

export const StepSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  type: StepTypeSchema,
  description: z.string(), // What this step does
  status: StepStatusSchema,

  // Action details (if type is 'action')
  tool: z.string().optional(),
  args: z.record(z.unknown()).optional(),

  // Execution results
  result: z.string().optional(),
  error: z.string().optional(),

  // Timing
  startedAt: z.number().optional(),
  completedAt: z.number().optional(),

  metadata: z.record(z.unknown()).optional(),
});
export type Step = z.infer<typeof StepSchema>;

// --- Context Definitions ---

export interface AgentContext {
  taskId: string;
  history: Message[]; // Chat history for LLM context
  state: Record<string, unknown>; // Shared state between steps
  // We'll add tools and other resources here later
}

// --- Strategy Interface ---

export interface IStrategy {
  id: string;
  name: string;
  description: string;

  /**
   * Initialize a task, potentially creating the first set of steps
   */
  init(task: Task, context: AgentContext): Promise<Step[]>;

  /**
   * Update the plan based on the result of the last step
   */
  next(task: Task, context: AgentContext, lastStep?: Step): Promise<Step | null>;
}
