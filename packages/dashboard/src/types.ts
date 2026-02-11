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

// ─── Task Types ──────────────────────────────────────────────────────

export type TaskStatus = 'running' | 'completed' | 'failed';

/** Summary item for the task history list */
export interface TaskHistoryItem {
    /** task_report id or run id */
    id: string;
    /** The original user input / task description */
    input: string;
    status: TaskStatus;
    /** ISO timestamp or epoch ms */
    createdAt: number;
    /** Duration in ms (undefined while running) */
    duration?: number;
    /** Short summary from the report (intentSummary) */
    summary?: string;
    /** Whether the task report comes from DB (true) or live run (false) */
    persisted: boolean;
}

/** Full detail for a single task (report + traces) */
export interface TaskDetail {
    id: string;
    input: string;
    status: TaskStatus;
    createdAt: number;
    completedAt?: number;
    duration?: number;
    /** Parsed task report data */
    report?: {
        intentSummary?: string;
        success?: boolean;
        summary?: string;
        outputs?: string[];
        followUps?: string[];
        steps?: Array<{
            stepId: string;
            status: string;
            tool?: string;
            duration?: number;
        }>;
    };
    /** Associated episode traces */
    traces?: Array<{
        id: number;
        step_index: number;
        tool_name: string;
        status: string;
        duration: number;
        args?: any;
        output?: any;
    }>;
    /** Episode metadata */
    episode?: {
        id: number;
        input: string;
        result?: string;
        strategy_id?: string;
        strategy_version?: string;
        created_at: number;
    };
}

/** Agent event in the live view */
export interface AgentEvent {
    type: string;
    data?: any;
    timestamp: number;
}

// ─── WebSocket message types ─────────────────────────────────────────

export interface WsMessage {
    type: string;
    data?: any;
    timestamp: number;
}

export type AgentEventType =
    | 'connected'
    | 'task:start'
    | 'task:resume'
    | 'task:complete'
    | 'task:error'
    | 'task:progress'
    | 'task:cancelled'
    | 'checkpoint:saved'
    | 'stream:text'
    | 'stream:thinking'
    | 'message'
    | 'tool:start'
    | 'tool:complete'
    | 'tool:error'
    | 'interaction_request'
    | 'retry'
    | 'pong';
