import type {
  ComputerUseActionEnvelope,
  ComputerUseError,
  ObservationBlock,
  ObservationFrame,
} from './runtime-contract.js';

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
    return buildComputerUseError('EXECUTION_FAILED', error.message, true);
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
