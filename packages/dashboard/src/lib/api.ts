import type { StrategyProposal, TaskHistoryItem, TaskDetail } from '../types';

const API_BASE = ''; // Relative path, assuming served from same origin

export const api = {
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
};
