import type { Strategy } from './strategy.js';

export interface GateResult {
  ok: boolean;
  reason?: string;
}

export class BasicStrategyGate {
  /**
   * Minimal automatic validation rules for strategy proposals.
   * Rejects obvious unsafe or ambiguous configurations.
   */
  public static validate(strategy: Strategy): GateResult {
    const metadata = (strategy as any).metadata || {};
    if (!metadata.id || !metadata.version) {
      return { ok: false, reason: 'missing metadata.id or metadata.version' };
    }

    const execution: any = (strategy as any).execution || {};
    if (execution.riskTolerance === 'high') {
      return { ok: false, reason: 'riskTolerance is too permissive' };
    }

    if (Array.isArray(execution.requiresConfirmation) && execution.requiresConfirmation.length === 0) {
      return { ok: false, reason: 'requiresConfirmation cannot be empty' };
    }

    const planning: any = (strategy as any).planning || {};
    if (typeof planning.temperature === 'number' && planning.temperature > 0.7) {
      return { ok: false, reason: 'planning.temperature is too high' };
    }

    return { ok: true };
  }
}
