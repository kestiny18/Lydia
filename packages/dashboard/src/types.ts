export interface StrategyMetadata {
    id: string;
    version: string;
    name: string;
    description?: string;
    author?: string;
    inheritFrom?: string;
}

export interface Strategy {
    metadata: StrategyMetadata;
    system: any;
    prompts?: any;
    planning?: any;
    execution?: any;
    preferences?: any;
    constraints?: any;
    evolution_limits?: any;
}

export interface StrategyProposal {
    id: number;
    strategy_path: string;
    status: 'pending_human' | 'approved' | 'rejected' | 'invalid';
    reason?: string;
    evaluation_json?: string; // JSON string
    created_at: number;
    decided_at?: number;
}

export interface EvaluationData {
    episodes: number;
    baseline?: any;
    candidate?: any;
    delta?: any;
    replay?: {
        episodes: number;
        drift_episodes: number;
        drift_steps: number;
    };
    review?: {
        findings: Array<{
            tool: string;
            total: number;
            failed: number;
            failureRate: number;
            recommendation: string;
        }>;
        suggestedConfirmations: string[];
    }
}

// WebSocket message types (P2-4)
export interface WsMessage {
    type: string;
    data?: any;
    timestamp: number;
}

export type AgentEventType =
    | 'connected'
    | 'task:start'
    | 'task:complete'
    | 'task:error'
    | 'stream:text'
    | 'stream:thinking'
    | 'message'
    | 'tool:start'
    | 'tool:complete'
    | 'tool:error'
    | 'interaction_request'
    | 'retry'
    | 'pong';
