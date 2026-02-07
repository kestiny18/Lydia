import type { Strategy } from './strategy.js';

export interface GateResult {
  ok: boolean;
  reason?: string;
}

export class StrategyUpdateGate {
  /**
   * Minimal automatic validation rules for strategy proposals.
   * Rejects obvious unsafe or ambiguous configurations.
   */
  public static validate(strategy: Strategy): GateResult {
    const preferences: any = strategy.preferences || {};
    const constraints: any = strategy.constraints || {};

    if (typeof preferences.autonomy_level === 'string') {
      const level = preferences.autonomy_level.toLowerCase();
      if (level === 'autonomous' || level === 'full') {
        return { ok: false, reason: 'autonomy_level is too permissive' };
      }
    }

    const confirmationBias = preferences.confirmation_bias;
    if (typeof confirmationBias === 'number' && confirmationBias < 0.2) {
      return { ok: false, reason: 'confirmation_bias is too low' };
    }

    const forbiddenKeys = [
      'skip_confirmations',
      'never_confirm',
      'allow_dangerous',
    ];
    for (const key of forbiddenKeys) {
      if (Object.prototype.hasOwnProperty.call(constraints, key)) {
        return { ok: false, reason: `forbidden constraint: ${key}` };
      }
    }

    return { ok: true };
  }
}
