import { StrategyProposal } from '../types';

const API_BASE = ''; // Relative path, assuming served from same origin

export const api = {
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

    async getStatus(): Promise<any> {
        const res = await fetch(`${API_BASE}/api/status`);
        return res.json();
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

    async getTaskReports(limit = 50): Promise<any[]> {
        const res = await fetch(`${API_BASE}/api/reports?limit=${limit}`);
        if (!res.ok) throw new Error('Failed to fetch task reports');
        return res.json();
    }
};
