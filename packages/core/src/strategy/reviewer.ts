import type { MemoryManager } from '../memory/index.js';
import type { Strategy } from './strategy.js';

export interface ReviewFinding {
  tool: string;
  total: number;
  failed: number;
  failureRate: number;
  recommendation: string;
}

export interface ReviewSummary {
  episodes: number;
  traces: number;
  findings: ReviewFinding[];
  suggestedConfirmations: string[];
}

export interface ReviewOptions {
  episodeLimit?: number;
  minFailures?: number;
  minFailureRate?: number;
}

export class StrategyReviewer {
  private memory: MemoryManager;

  constructor(memory: MemoryManager) {
    this.memory = memory;
  }

  review(strategy: Strategy, options: ReviewOptions = {}): ReviewSummary {
    const episodeLimit = options.episodeLimit ?? 50;
    const minFailures = options.minFailures ?? 1;
    const minFailureRate = options.minFailureRate ?? 0.2;

    const episodes = this.memory.listEpisodes(episodeLimit);
    const toolStats = new Map<string, { total: number; failed: number }>();
    let traceCount = 0;

    for (const ep of episodes) {
      if (!ep.id) continue;
      const traces = this.memory.getTraces(ep.id);
      for (const trace of traces) {
        traceCount += 1;
        const stat = toolStats.get(trace.tool_name) || { total: 0, failed: 0 };
        stat.total += 1;
        if (trace.status === 'failed') {
          stat.failed += 1;
        }
        toolStats.set(trace.tool_name, stat);
      }
    }

    const requiresConfirmation = new Set(strategy.execution?.requiresConfirmation || []);
    const findings: ReviewFinding[] = [];
    const suggestedConfirmations: string[] = [];

    for (const [tool, stat] of toolStats.entries()) {
      const failureRate = stat.total > 0 ? stat.failed / stat.total : 0;
      if (stat.failed >= minFailures || failureRate >= minFailureRate) {
        findings.push({
          tool,
          total: stat.total,
          failed: stat.failed,
          failureRate,
          recommendation: requiresConfirmation.has(tool)
            ? 'Keep confirmation requirement'
            : 'Add confirmation requirement'
        });
        if (!requiresConfirmation.has(tool)) {
          suggestedConfirmations.push(tool);
        }
      }
    }

    return {
      episodes: episodes.length,
      traces: traceCount,
      findings,
      suggestedConfirmations
    };
  }
}
