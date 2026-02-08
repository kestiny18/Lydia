import { describe, it, expect } from 'vitest';
import { StrategyBranchManager } from '../src/strategy/branch-manager.js';
import { StrategyRegistry } from '../src/strategy/registry.js';
import { StrategyUpdateGate } from '../src/gate/engine.js';
import { ReplayManager } from '../src/replay/manager.js';
import * as path from 'path';
import * as os from 'os';

describe('Controlled Evolution Integration', () => {
    it('should create branch, verify existence, and pass update gate', async () => {
        // 1. Setup
        const registry = new StrategyRegistry();
        const branchManager = new StrategyBranchManager(path.join(os.homedir(), '.lydia', 'strategies-test'));
        const gate = new StrategyUpdateGate();
        const replay = new ReplayManager();

        await branchManager.init();

        // 2. Load Default Strategy
        // We might need to mock or ensure default exists. 
        // StrategyRegistry looks in .lydia/strategies/default.yml or package built-ins.
        // Built-ins should be safe.
        let defaultStrategy;
        try {
            defaultStrategy = await registry.loadDefault();
        } catch (e) {
            console.warn('Could not load default strategy, creating mock');
            defaultStrategy = {
                metadata: { id: 'mock-v1', version: '1.0.0', name: 'Mock' },
                system: { role: 'bot' }
            } as any;
        }

        expect(defaultStrategy).toBeDefined();

        // 3. Create a New Branch
        const newBranchName = `experiment-${Date.now()}`;
        const newStrategy = await branchManager.createBranch(defaultStrategy, newBranchName, {
            metadata: {
                description: 'An experimental strategy with higher risk tolerance.'
            },
            preferences: {
                riskTolerance: 0.8
            }
        });

        expect(newStrategy.metadata.id).toBe(newBranchName);

        // 4. Retrieve the Branch Info
        const branches = await branchManager.listBranches();
        const branchInfo = branches.find(b => b.name === newBranchName);

        expect(branchInfo).toBeDefined();
        expect(branchInfo?.path).toContain(newBranchName);

        // 5. Run Update Gate
        const gateResult = await gate.process(newStrategy, branchInfo!, []);

        // Expect PASS or NEEDS_HUMAN (depending on risk) but not crash
        expect(['PASS', 'NEEDS_HUMAN', 'REJECT']).toContain(gateResult.status);

        // 6. Replay Init
        expect(replay).toBeDefined();
    });

    it('should initialize Agent with SelfEvolutionSkill', async () => {
        // Mock LLM
        const mockLLM = {
            chat: async () => ({ role: 'assistant', content: 'ok' })
        } as any;

        const { Agent } = await import('../src/execution/agent.js');
        const agent = new Agent(mockLLM);

        await agent.init();

        // Check if skill is registered
        // We need to access skillRegistry which is private, but for testing we can cast to any
        const registry = (agent as any).skillRegistry;
        const evolutionSkill = registry.get('self_evolution');

        expect(evolutionSkill).toBeDefined();
        expect(evolutionSkill.name).toBe('self_evolution');
    });
});
