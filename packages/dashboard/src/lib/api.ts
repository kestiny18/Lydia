import type { StrategyProposal, TaskHistoryItem, TaskDetail } from '../types';

const API_BASE = ''; // Relative path, assuming served from same origin

export const api = {
    async getSetupStatus(): Promise<{
        ready: boolean;
        configPath: string;
        strategyPath: string;
        llmConfigured: boolean;
        provider: string;
    }> {
        const res = await fetch(`${API_BASE}/api/setup`);
        if (!res.ok) throw new Error('Failed to fetch setup status');
        return res.json();
    },

    async initializeSetup(): Promise<any> {
        const res = await fetch(`${API_BASE}/api/setup/init`, { method: 'POST' });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to initialize setup');
        }
        return res.json();
    },

    async getSetupConfig(): Promise<any> {
        const res = await fetch(`${API_BASE}/api/setup/config`);
        if (!res.ok) throw new Error('Failed to fetch setup config');
        return res.json();
    },

    async updateSetupConfig(payload: {
        llm: {
            provider?: string;
            defaultModel?: string;
            fallbackOrder?: string[];
            openaiApiKey?: string;
            anthropicApiKey?: string;
            openaiBaseUrl?: string;
            anthropicBaseUrl?: string;
            ollamaBaseUrl?: string;
        };
    }): Promise<any> {
        const res = await fetch(`${API_BASE}/api/setup/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to update setup config');
        }
        return res.json();
    },

    async testLLM(probe = false): Promise<any> {
        const res = await fetch(`${API_BASE}/api/setup/test-llm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ probe }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.ok === false) {
            throw new Error(data.error || 'LLM test failed');
        }
        return data;
    },
    // ─── Task APIs ──────────────────────────────────────────────────

    async getTaskHistory(options?: {
        limit?: number;
        offset?: number;
        status?: string;
        search?: string;
    }): Promise<{ items: TaskHistoryItem[]; total: number; activeRunId: string | null }> {
        const params = new URLSearchParams();
        if (options?.limit) params.set('limit', String(options.limit));
        if (options?.offset) params.set('offset', String(options.offset));
        if (options?.status) params.set('status', options.status);
        if (options?.search) params.set('search', options.search);
        const qs = params.toString();
        const res = await fetch(`${API_BASE}/api/tasks${qs ? `?${qs}` : ''}`);
        if (!res.ok) throw new Error('Failed to fetch task history');
        return res.json();
    },

    async getTaskDetail(id: string): Promise<TaskDetail> {
        const res = await fetch(`${API_BASE}/api/tasks/${encodeURIComponent(id)}/detail`);
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to fetch task detail');
        }
        return res.json();
    },

    async getTaskStatus(runId: string): Promise<any> {
        const res = await fetch(`${API_BASE}/api/tasks/${runId}/status`);
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to fetch task status');
        }
        return res.json();
    },

    async runTask(input: string): Promise<{ runId: string }> {
        const res = await fetch(`${API_BASE}/api/tasks/run`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ input })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to run task');
        }
        return res.json();
    },

    async respondToTask(runId: string, response: string): Promise<void> {
        const res = await fetch(`${API_BASE}/api/tasks/${runId}/respond`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ response })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to send response');
        }
    },

    // ─── Checkpoint / Resume APIs ────────────────────────────────────

    async getResumableTasks(): Promise<{ items: Array<{
        taskId: string;
        runId: string;
        input: string;
        iteration: number;
        taskCreatedAt: number;
        updatedAt: number;
    }> }> {
        const res = await fetch(`${API_BASE}/api/tasks/resumable`);
        if (!res.ok) throw new Error('Failed to fetch resumable tasks');
        return res.json();
    },

    async resumeTask(taskId: string): Promise<{ runId: string; resumed: boolean; fromIteration: number }> {
        const res = await fetch(`${API_BASE}/api/tasks/${encodeURIComponent(taskId)}/resume`, {
            method: 'POST',
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to resume task');
        }
        return res.json();
    },

    // ─── Task Reports (legacy, still used by settings) ──────────────

    async getTaskReports(limit = 50): Promise<any[]> {
        const res = await fetch(`${API_BASE}/api/reports?limit=${limit}`);
        if (!res.ok) throw new Error('Failed to fetch task reports');
        return res.json();
    },

    async getFacts(limit = 100): Promise<any[]> {
        const res = await fetch(`${API_BASE}/api/memory/facts?limit=${limit}`);
        if (!res.ok) throw new Error('Failed to fetch memory facts');
        return res.json();
    },

    async getEpisodes(limit = 50): Promise<any[]> {
        const res = await fetch(`${API_BASE}/api/replay?limit=${limit}`);
        if (!res.ok) throw new Error('Failed to fetch replay episodes');
        return res.json();
    },

    // ─── Strategy APIs ──────────────────────────────────────────────

    async getProposals(limit = 50): Promise<StrategyProposal[]> {
        const res = await fetch(`${API_BASE}/api/strategy/proposals?limit=${limit}`);
        if (!res.ok) throw new Error('Failed to fetch proposals');
        return res.json();
    },

    async approveProposal(id: number): Promise<void> {
        const res = await fetch(`${API_BASE}/api/strategy/proposals/${id}/approve`, {
            method: 'POST'
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Failed to approve');
        }
    },

    async rejectProposal(id: number, reason: string): Promise<void> {
        const res = await fetch(`${API_BASE}/api/strategy/proposals/${id}/reject`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason })
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Failed to reject');
        }
    },

    async getStrategyContent(path: string): Promise<string> {
        const res = await fetch(`${API_BASE}/api/strategy/content?path=${encodeURIComponent(path)}`);
        if (!res.ok) throw new Error('Failed to fetch strategy content');
        const data = await res.json();
        return data.content;
    },

    async getActiveStrategy(): Promise<{ path: string; content: string }> {
        const res = await fetch(`${API_BASE}/api/strategy/active`);
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Failed to fetch active strategy');
        }
        return res.json();
    },

    // ─── System APIs ────────────────────────────────────────────────

    async getStatus(): Promise<any> {
        const res = await fetch(`${API_BASE}/api/status`);
        return res.json();
    },

    async getMcpHealth(options?: { server?: string; timeoutMs?: number; retries?: number }): Promise<any> {
        const params = new URLSearchParams();
        if (options?.server) params.set('server', options.server);
        if (options?.timeoutMs !== undefined) params.set('timeoutMs', String(options.timeoutMs));
        if (options?.retries !== undefined) params.set('retries', String(options.retries));
        const qs = params.toString();
        const res = await fetch(`${API_BASE}/api/mcp/check${qs ? `?${qs}` : ''}`);
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to check MCP health');
        }
        return res.json();
    },

    async startChatSession(): Promise<{ sessionId: string }> {
        const res = await fetch(`${API_BASE}/api/chat/start`, { method: 'POST' });
        if (!res.ok) throw new Error('Failed to start chat session');
        return res.json();
    },

    async sendChatMessage(sessionId: string, message: string): Promise<{ response: string }> {
        const res = await fetch(`${API_BASE}/api/chat/${encodeURIComponent(sessionId)}/message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to send chat message');
        }
        return res.json();
    },
};
