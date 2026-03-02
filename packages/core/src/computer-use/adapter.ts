import type {
  ComputerUseActionEnvelope,
  ComputerUseError,
  ObservationBlock,
  ObservationFrame,
} from './runtime-contract.js';
import { listCanonicalComputerUseActions } from './contract.js';

export interface ComputerUseAdapterContext {
  toolName: string;
  invokeTool: (toolName: string, args: Record<string, unknown>) => Promise<any>;
  createFrameId?: () => string;
}

export interface ComputerUseAdapterResult {
  toolResult: any;
  frame: ObservationFrame;
}

export interface ComputerUseCapabilityAdapter {
  id: string;
  execute(
    action: ComputerUseActionEnvelope,
    context: ComputerUseAdapterContext,
  ): Promise<ComputerUseAdapterResult>;
}

export class McpCanonicalCapabilityAdapter implements ComputerUseCapabilityAdapter {
  public readonly id = 'mcp-canonical-adapter';

  async execute(
    action: ComputerUseActionEnvelope,
    context: ComputerUseAdapterContext,
  ): Promise<ComputerUseAdapterResult> {
    try {
      this.validateActionArgs(action);
      const toolResult = await context.invokeTool(context.toolName, action.args);
      const blocks = this.extractObservationBlocks(toolResult);
      if (blocks.length === 0) {
        throw buildComputerUseError(
          'OBSERVATION_MISSING',
          `No observation blocks returned by tool "${context.toolName}"`,
          false,
        );
      }

      const frame: ObservationFrame = {
        sessionId: action.sessionId,
        actionId: action.actionId,
        frameId: context.createFrameId ? context.createFrameId() : createFrameId(action.actionId),
        blocks,
        createdAt: Date.now(),
      };

      return { toolResult, frame };
    } catch (error) {
      throw normalizeComputerUseError(error);
    }
  }

  private validateActionArgs(action: ComputerUseActionEnvelope): void {
    const requiredArgs = REQUIRED_ARGS_BY_ACTION.get(action.canonicalAction) || [];
    if (requiredArgs.length === 0) return;

    const missing = requiredArgs.filter((arg) => {
      const value = action.args[arg];
      if (value === undefined || value === null) return true;
      if (typeof value === 'string' && value.trim().length === 0) return true;
      return false;
    });
    if (missing.length === 0) return;

    throw buildComputerUseError(
      'ARG_INVALID',
      `Missing required argument(s) for ${action.canonicalAction}: ${missing.join(', ')}`,
      false,
      {
        canonicalAction: action.canonicalAction,
        missingArgs: missing,
      },
    );
  }

  private extractObservationBlocks(result: any): ObservationBlock[] {
    const blocks: ObservationBlock[] = [];

    if (result && Array.isArray(result.content)) {
      for (const contentBlock of result.content) {
        if (contentBlock?.type === 'text' && typeof contentBlock.text === 'string') {
          blocks.push({ type: 'text', text: contentBlock.text });
          continue;
        }

        if (
          contentBlock?.type === 'image' &&
          contentBlock.source?.type === 'base64' &&
          typeof contentBlock.source.media_type === 'string' &&
          typeof contentBlock.source.data === 'string'
        ) {
          // Keep image payload out of checkpoint rows by using a synthetic reference.
          blocks.push({
            type: 'image',
            mediaType: contentBlock.source.media_type,
            dataRef: `inline://image/${contentBlock.source.media_type}/${contentBlock.source.data.length}`,
          });
          continue;
        }
      }
    }

    if (typeof result?.artifactPath === 'string') {
      blocks.push({ type: 'artifact_ref', kind: 'log', path: result.artifactPath });
    }

    if (typeof result?.downloadPath === 'string') {
      blocks.push({ type: 'artifact_ref', kind: 'download', path: result.downloadPath });
    }

    if (blocks.length === 0 && result !== undefined) {
      if (typeof result === 'string') {
        blocks.push({ type: 'text', text: result });
      } else if (result && typeof result === 'object') {
        blocks.push({ type: 'structured_json', payload: result as Record<string, unknown> });
      }
    }

    return blocks;
  }
}

function createFrameId(actionId: string): string {
  return `frame-${actionId}-${Date.now().toString(36)}`;
}

const REQUIRED_ARGS_BY_ACTION = (() => {
  const map = new Map<string, string[]>();
  for (const action of listCanonicalComputerUseActions()) {
    map.set(action.toolName, action.requiredArgs);
  }
  return map;
})();

function buildComputerUseError(
  code: ComputerUseError['code'],
  message: string,
  retryable: boolean,
  details?: Record<string, unknown>,
): ComputerUseError {
  return { code, message, retryable, details };
}

export function normalizeComputerUseError(error: unknown): ComputerUseError {
  if (isComputerUseError(error)) return error;
  if (error instanceof Error) {
    const msg = error.message || 'unknown execution error';
    const lowered = msg.toLowerCase();

    if (
      lowered.includes('tool') &&
      (lowered.includes('not found') || lowered.includes('not connected'))
    ) {
      return buildComputerUseError('CAPABILITY_UNAVAILABLE', msg, false);
    }
    if (lowered.includes('denied') || lowered.includes('policy') || lowered.includes('not allowed')) {
      return buildComputerUseError('POLICY_DENIED', msg, false);
    }
    if (
      lowered.includes('invalid argument') ||
      lowered.includes('missing required') ||
      lowered.includes('schema')
    ) {
      return buildComputerUseError('ARG_INVALID', msg, false);
    }
    return buildComputerUseError('EXECUTION_FAILED', msg, true);
  }
  return buildComputerUseError('EXECUTION_FAILED', String(error), true);
}

function isComputerUseError(error: unknown): error is ComputerUseError {
  if (!error || typeof error !== 'object') return false;
  return (
    typeof (error as ComputerUseError).code === 'string' &&
    typeof (error as ComputerUseError).message === 'string' &&
    typeof (error as ComputerUseError).retryable === 'boolean'
  );
}
