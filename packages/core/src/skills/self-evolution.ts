import type { DynamicSkill, SkillContext } from './types.js';

import { StrategyBranchManager } from '../strategy/branch-manager.js';
import { StrategyUpdateGate } from '../gate/engine.js';
import { ReviewManager } from '../gate/review-manager.js';
import { StrategyRegistry } from '../strategy/registry.js';
import { MemoryManager } from '../memory/manager.js';

export class SelfEvolutionSkill implements DynamicSkill {
    name = 'self_evolution';
    description = 'Allows the agent to propose improvements to its own strategy and behavior.';
    version = '1.1.0';
    // Keywords for matching
    content = 'planning error fail optimize fix better analysis performance debug strategy evolution improvement';

    constructor(
        private branchManager: StrategyBranchManager,
        private gate: StrategyUpdateGate,
        private reviewManager: ReviewManager,
        private registry: StrategyRegistry,
        private memoryManager: MemoryManager
    ) { }

    tools = [
        {
            name: 'analyze_performance',
            description: 'Analyze recent task performance to identify areas for improvement.',
            inputSchema: {
                type: 'object',
                properties: {
                    limit: {
                        type: 'number',
                        description: 'Number of recent episodes to analyze (default: 50)'
                    }
                }
            }
        },
        {
            name: 'propose_strategy_update',
            description: 'Propose a modification to the current strategy based on performance analysis.',
            inputSchema: {
                type: 'object',
                properties: {
                    analysis: {
                        type: 'string',
                        description: 'Detailed analysis of why this change is needed, referencing performance metrics.'
                    },
                    description: {
                        type: 'string',
                        description: 'Short summary of the change.'
                    },
                    modifications: {
                        type: 'string', // JSON string
                        description: 'JSON string containing the partial Strategy object to merge.'
                    }
                },
                required: ['analysis', 'description', 'modifications']
            }
        }
    ];

    async execute(toolName: string, args: any, context: SkillContext): Promise<string> {
        if (toolName === 'analyze_performance') {
            const limit = args.limit || 50;
            const metrics = this.memoryManager.getPerformanceMetrics(limit);

            return JSON.stringify({
                analyzed_episodes: metrics.total,
                success_rate: metrics.total > 0 ? ((metrics.success / metrics.total) * 100).toFixed(1) + '%' : 'N/A',
                failures: metrics.failure,
                message: metrics.failure > 0 ? "Failures detected. Consider reviewing recent traces." : "Performance is stable."
            }, null, 2);
        }

        if (toolName === 'propose_strategy_update') {
            const { description, modifications, analysis } = args;
            let strategyDelta;
            try {
                strategyDelta = typeof modifications === 'string' ? JSON.parse(modifications) : modifications;
            } catch (e) {
                return `Failed to parse modifications JSON: ${e}`;
            }

            // 1. Get Current Strategy
            const currentStrategy = this.registry.getActive();

            // 2. Create Branch
            const branchName = `evolve-${Date.now()}`;
            const newStrategy = await this.branchManager.createBranch(currentStrategy, branchName, {
                ...strategyDelta,
                metadata: {
                    ...currentStrategy.metadata,
                    description: `${currentStrategy.metadata.description} | Update: ${description}`
                }
            });

            const branchInfo = (await this.branchManager.listBranches()).find(b => b.name === branchName);
            if (!branchInfo) return 'Error: Failed to create strategy branch.';

            // 3. Run Gate
            const validation = await this.gate.process(newStrategy, branchInfo, [], currentStrategy);

            // 4. Act on Result
            const reqDetails = {
                source: 'self_evolution',
                branchName: branchName,
                strategyId: newStrategy.metadata.id,
                strategyPath: branchInfo.path,
                diffSummary: `[Analysis]: ${analysis}\n[Change]: ${description}`,
                validationResult: validation,
                analysis,
                description
            };

            const reqId = await this.reviewManager.addRequest(reqDetails);

            if (validation.status === 'REJECT') {
                return `Strategy update rejected by safety gate: ${validation.reason}. Proposal ID: ${reqId}`;
            }

            if (validation.status === 'NEEDS_HUMAN' || validation.status === 'PASS') {
                return `Strategy update proposed and queued for review. Request ID: ${reqId}.\nValidation: ${validation.reason || 'Passed auto-checks'}`;
            }

            return 'Unknown state';
        }

        throw new Error(`Unknown tool: ${toolName}`);
    }
}
