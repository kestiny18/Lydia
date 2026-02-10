import { z } from 'zod';

export const RoleSchema = z.enum(['system', 'user', 'assistant', 'tool']);
export type Role = z.infer<typeof RoleSchema>;

export const TextContentSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});
export type TextContent = z.infer<typeof TextContentSchema>;

export const ImageContentSchema = z.object({
  type: z.literal('image'),
  source: z.object({
    type: z.literal('base64'),
    media_type: z.string(),
    data: z.string(),
  }),
});
export type ImageContent = z.infer<typeof ImageContentSchema>;

export const ToolUseContentSchema = z.object({
  type: z.literal('tool_use'),
  id: z.string(),
  name: z.string(),
  input: z.record(z.unknown()),
});
export type ToolUseContent = z.infer<typeof ToolUseContentSchema>;

export const ToolResultContentSchema = z.object({
  type: z.literal('tool_result'),
  tool_use_id: z.string(),
  content: z.union([z.string(), z.array(z.union([TextContentSchema, ImageContentSchema]))]),
  is_error: z.boolean().optional(),
});
export type ToolResultContent = z.infer<typeof ToolResultContentSchema>;

export const ThinkingContentSchema = z.object({
  type: z.literal('thinking'),
  thinking: z.string(),
  signature: z.string().optional(),
});
export type ThinkingContent = z.infer<typeof ThinkingContentSchema>;

export const ContentBlockSchema = z.union([
  TextContentSchema,
  ImageContentSchema,
  ToolUseContentSchema,
  ToolResultContentSchema,
  ThinkingContentSchema,
]);
export type ContentBlock = z.infer<typeof ContentBlockSchema>;

export const MessageSchema = z.object({
  role: RoleSchema,
  content: z.union([z.string(), z.array(ContentBlockSchema)]),
  name: z.string().optional(),
});
export type Message = z.infer<typeof MessageSchema>;

export const TokenUsageSchema = z.object({
  input_tokens: z.number(),
  output_tokens: z.number(),
  total_tokens: z.number(),
});
export type TokenUsage = z.infer<typeof TokenUsageSchema>;

export const LLMResponseSchema = z.object({
  id: z.string(),
  content: z.array(ContentBlockSchema),
  role: RoleSchema,
  model: z.string(),
  stop_reason: z.enum(['end_turn', 'max_tokens', 'stop_sequence', 'tool_use', 'error', 'pause_turn']).nullable(),
  usage: TokenUsageSchema,
});
export type LLMResponse = z.infer<typeof LLMResponseSchema>;

export const ToolDefinitionSchema = z.object({
  name: z.string(),
  description: z.string().default(''),
  inputSchema: z.record(z.unknown()), // JSON Schema object
});
export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;

// ─── Streaming Types ────────────────────────────────────────────────

export type StreamChunk =
  | { type: 'text_delta'; text: string }
  | { type: 'thinking_delta'; thinking: string }
  | { type: 'tool_use_start'; id: string; name: string }
  | { type: 'tool_use_delta'; id: string; input_json: string }
  | { type: 'tool_use_end'; id: string }
  | { type: 'message_stop'; response: LLMResponse }
  | { type: 'error'; error: string };

// ─── Request ────────────────────────────────────────────────────────

export const LLMRequestSchema = z.object({
  messages: z.array(MessageSchema),
  model: z.string().optional(),
  max_tokens: z.number().optional(),
  temperature: z.number().optional(),
  tools: z.array(ToolDefinitionSchema).optional(),
  system: z.string().optional(),
  stop: z.array(z.string()).optional(),
});
export type LLMRequest = z.infer<typeof LLMRequestSchema>;
