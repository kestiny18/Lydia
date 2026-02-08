import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { Strategy } from '../strategy/strategy.js';
import { ValidationResult } from './validators.js';

export interface ReviewRequest {
    id: string;
    source: string; // e.g. 'self_evolution', 'foundry'
    timestamp: number;
    branchName: string; // The branch waiting for approval
    strategyId: string;
    diffSummary: string;
    validationResult: ValidationResult;
    status: 'pending' | 'approved' | 'rejected';
}

export class ReviewManager {
    private storagePath: string;

    constructor(storageDir?: string) {
        this.storagePath = path.join(storageDir || path.join(os.homedir(), '.lydia'), 'reviews.json');
    }

    async init() {
        try {
            await fs.access(this.storagePath);
        } catch {
            await fs.writeFile(this.storagePath, JSON.stringify([]), 'utf-8');
        }
    }

    async addRequest(request: Omit<ReviewRequest, 'id' | 'timestamp' | 'status'>): Promise<string> {
        const requests = await this.loadRequests();
        const newRequest: ReviewRequest = {
            ...request,
            id: `req-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            timestamp: Date.now(),
            status: 'pending'
        };
        requests.push(newRequest);
        await this.saveRequests(requests);
        return newRequest.id;
    }

    async listPending(): Promise<ReviewRequest[]> {
        const requests = await this.loadRequests();
        return requests.filter(r => r.status === 'pending');
    }

    async getRequest(id: string): Promise<ReviewRequest | undefined> {
        const requests = await this.loadRequests();
        return requests.find(r => r.id === id);
    }

    async updateStatus(id: string, status: 'approved' | 'rejected'): Promise<void> {
        const requests = await this.loadRequests();
        const idx = requests.findIndex(r => r.id === id);
        if (idx === -1) throw new Error(`Request ${id} not found`);

        requests[idx].status = status;
        await this.saveRequests(requests);
    }

    private async loadRequests(): Promise<ReviewRequest[]> {
        try {
            const content = await fs.readFile(this.storagePath, 'utf-8');
            return JSON.parse(content);
        } catch {
            return [];
        }
    }

    private async saveRequests(requests: ReviewRequest[]): Promise<void> {
        await fs.writeFile(this.storagePath, JSON.stringify(requests, null, 2), 'utf-8');
    }
}
