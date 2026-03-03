import { EventEmitter } from 'node:events';
import type { ComputerUseCapabilityAdapter } from './adapter.js';
import type {
  ComputerUseActionEnvelope,
  ComputerUseCheckpoint,
  ComputerUseError,
  ObservationFrame,
} from './runtime-contract.js';

interface SessionState {
  sessionId: string;
  taskId: string;
  latestFrameIds: string[];
  lastActionId?: string;
  verificationFailures: number;
}

export interface DispatchCanonicalActionRequest {
  taskId: string;
  action: ComputerUseActionEnvelope;
  adapter: ComputerUseCapabilityAdapter;
  toolName: string;
  invokeTool: (toolName: string, args: Record<string, unknown>) => Promise<any>;
}

export interface DispatchCanonicalActionResult {
  sessionId: string;
  toolResult: any;
  frame: ObservationFrame;
  frameId: string;
  checkpoint: ComputerUseCheckpoint;
}

export class ComputerUseSessionOrchestrator extends EventEmitter {
  private sessions = new Map<string, SessionState>();

  startSession(taskId: string, sessionId?: string): SessionState {
    const id = sessionId || `cus-${taskId}-${Date.now().toString(36)}`;
    const existing = this.sessions.get(id);
    if (existing) return existing;

    const state: SessionState = {
      sessionId: id,
      taskId,
      latestFrameIds: [],
      verificationFailures: 0,
    };
    this.sessions.set(id, state);
    this.emit('session.start', { sessionId: id, taskId });
    return state;
  }

  async dispatchCanonicalAction(
    request: DispatchCanonicalActionRequest,
  ): Promise<DispatchCanonicalActionResult> {
    const state = this.startSession(request.taskId, request.action.sessionId);
    this.emit('action.dispatch', {
      sessionId: state.sessionId,
      taskId: state.taskId,
      actionId: request.action.actionId,
      canonicalAction: request.action.canonicalAction,
      riskLevel: request.action.riskLevel,
    });

    try {
      const result = await request.adapter.execute(request.action, {
        toolName: request.toolName,
        invokeTool: request.invokeTool,
      });

      state.lastActionId = request.action.actionId;
      state.latestFrameIds = [result.frame.frameId, ...state.latestFrameIds].slice(0, 10);

      this.emit('observation.collect', {
        sessionId: state.sessionId,
        actionId: request.action.actionId,
        frameId: result.frame.frameId,
        blocks: result.frame.blocks.length,
      });
      this.emit('verification', {
        sessionId: state.sessionId,
        actionId: request.action.actionId,
        ok: true,
      });

      const checkpoint = this.buildCheckpoint(state);
      this.emit('checkpoint.save', checkpoint);

      return {
        sessionId: state.sessionId,
        toolResult: result.toolResult,
        frame: result.frame,
        frameId: result.frame.frameId,
        checkpoint,
      };
    } catch (error) {
      state.lastActionId = request.action.actionId;
      state.verificationFailures += 1;

      const normalized = this.normalizeError(error);
      this.emit('verification', {
        sessionId: state.sessionId,
        actionId: request.action.actionId,
        ok: false,
        code: normalized.code,
      });

      const checkpoint = this.buildCheckpoint(state);
      this.emit('checkpoint.save', checkpoint);
      throw normalized;
    }
  }

  endSession(sessionId: string): ComputerUseCheckpoint | undefined {
    const state = this.sessions.get(sessionId);
    if (!state) return undefined;
    const checkpoint = this.buildCheckpoint(state);
    this.sessions.delete(sessionId);
    this.emit('session.end', checkpoint);
    return checkpoint;
  }

  getCheckpoint(sessionId: string): ComputerUseCheckpoint | undefined {
    const state = this.sessions.get(sessionId);
    if (!state) return undefined;
    return this.buildCheckpoint(state);
  }

  restoreCheckpoint(checkpoint: ComputerUseCheckpoint): void {
    this.sessions.set(checkpoint.sessionId, {
      sessionId: checkpoint.sessionId,
      taskId: checkpoint.taskId,
      latestFrameIds: [...checkpoint.latestFrameIds],
      lastActionId: checkpoint.lastActionId,
      verificationFailures: checkpoint.verificationFailures,
    });
  }

  private buildCheckpoint(state: SessionState): ComputerUseCheckpoint {
    return {
      sessionId: state.sessionId,
      taskId: state.taskId,
      lastActionId: state.lastActionId,
      latestFrameIds: [...state.latestFrameIds],
      verificationFailures: state.verificationFailures,
      updatedAt: Date.now(),
    };
  }

  private normalizeError(error: unknown): ComputerUseError {
    if (
      error &&
      typeof error === 'object' &&
      typeof (error as ComputerUseError).code === 'string' &&
      typeof (error as ComputerUseError).message === 'string' &&
      typeof (error as ComputerUseError).retryable === 'boolean'
    ) {
      return error as ComputerUseError;
    }

    if (error instanceof Error) {
      return {
        code: 'EXECUTION_FAILED',
        message: error.message,
        retryable: true,
      };
    }

    return {
      code: 'EXECUTION_FAILED',
      message: String(error),
      retryable: true,
    };
  }
}
