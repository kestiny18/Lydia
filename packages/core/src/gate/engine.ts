import { Strategy } from '../strategy/strategy.js';
import { StrategyBranch } from '../strategy/branch-manager.js';
import { EvaluationResult } from '../replay/evaluator.js';
import {
    GateValidator,
    ValidationResult,
    SyntaxValidator,
    EvolutionLimitValidator,
    ReplayPerformanceValidator,
    RiskSafetyValidator
} from './validators.js';

export class StrategyUpdateGate {
    private validators: GateValidator[];

    constructor() {
        this.validators = [
            new SyntaxValidator(),
            new EvolutionLimitValidator(),
            new RiskSafetyValidator(),
            new ReplayPerformanceValidator() // Should be last as it might depend on replay data
        ];
    }

    async process(
        candidate: Strategy,
        branch: StrategyBranch,
        evaluations?: EvaluationResult[]
    ): Promise<ValidationResult> {

        for (const validator of this.validators) {
            try {
                const result = await validator.validate(candidate, branch, evaluations);

                if (result.status === 'REJECT') {
                    console.log(`Gate REJECT [${validator.name}]: ${result.reason}`);
                    return result;
                }

                if (result.status === 'NEEDS_HUMAN') {
                    console.log(`Gate NEEDS_HUMAN [${validator.name}]: ${result.reason}`);
                    // We can chose to return immediately or continue checking others?
                    // Usually return immediately for manual review
                    return result;
                }

            } catch (error) {
                console.error(`Validator ${validator.name} failed:`, error);
                return { status: 'NEEDS_HUMAN', reason: `Validator error: ${error}` };
            }
        }

        return { status: 'PASS' };
    }
}
