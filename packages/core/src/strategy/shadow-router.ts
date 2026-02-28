import * as path from 'node:path';
import * as os from 'node:os';
import { MemoryManager, type StrategyEpisodeSummary } from '../memory/manager.js';
import type { LydiaConfig } from '../config/schema.js';
import { StrategyRegistry } from './registry.js';
import type { Strategy } from './strategy.js';

export interface RoutedStrategy {
  role: 'baseline' | 'candidate';
  path?: string;
  strategyId: string;
  strategyVersion: string;
  reason: string;
}

export interface ShadowPromotionDecision {
  candidatePath: string;
  candidateId: string;
  candidateVersion: string;
  baselineId: string;
  baselineVersion: string;
  candidateSummary: StrategyEpisodeSummary;
  baselineSummary: StrategyEpisodeSummary;
  successImprovement: number;
  pValue: number;
}

export class ShadowRouter {
  private memory: MemoryManager;
  private registry: StrategyRegistry;
  private random: () => number;

  constructor(
    memoryManager?: MemoryManager,
    strategyRegistry?: StrategyRegistry,
    random: () => number = Math.random
  ) {
    if (memoryManager) {
      this.memory = memoryManager;
    } else {
      const dbPath = path.join(os.homedir(), '.lydia', 'memory.db');
      this.memory = new MemoryManager(dbPath);
    }
    this.registry = strategyRegistry || new StrategyRegistry();
    this.random = random;
  }

  async selectStrategy(config: LydiaConfig): Promise<RoutedStrategy> {
    const baseline = await this.loadBaseline(config);
    const candidates = await this.loadCandidates(config);
    const rolloutMode = config.strategy.shadowRolloutMode ?? 'shadow';
    if (!config.strategy.shadowModeEnabled || candidates.length === 0) {
      return {
        role: 'baseline',
        path: config.strategy.activePath || undefined,
        strategyId: baseline.metadata.id,
        strategyVersion: baseline.metadata.version,
        reason: 'shadow_mode_disabled_or_no_candidates',
      };
    }

    if (rolloutMode === 'shadow') {
      return {
        role: 'baseline',
        path: config.strategy.activePath || undefined,
        strategyId: baseline.metadata.id,
        strategyVersion: baseline.metadata.version,
        reason: 'shadow_rollout_mode_baseline_only',
      };
    }

    const ratio = config.strategy.shadowTrafficRatio;
    if (this.random() > ratio) {
      return {
        role: 'baseline',
        path: config.strategy.activePath || undefined,
        strategyId: baseline.metadata.id,
        strategyVersion: baseline.metadata.version,
        reason: 'traffic_routed_to_baseline',
      };
    }

    const windowMs = Date.now() - (config.strategy.shadowWindowDays * 24 * 60 * 60 * 1000);
    const withSummaries = candidates
      .map((candidate) => {
        const summary = this.memory.summarizeEpisodesByStrategy(
          candidate.strategy.metadata.id,
          candidate.strategy.metadata.version,
          { sinceMs: windowMs, limit: 500 }
        );
        return {
          ...candidate,
          summary,
        };
      });
    const totalPulls = withSummaries.reduce((acc, item) => acc + item.summary.total, 0);
    const bestCandidate = withSummaries
      .map((candidate) => ({
        ...candidate,
        score: this.computeUcbScore(candidate.summary, totalPulls),
      }))
      .sort((a, b) => b.score - a.score)[0];

    if (!bestCandidate) {
      return {
        role: 'baseline',
        path: config.strategy.activePath || undefined,
        strategyId: baseline.metadata.id,
        strategyVersion: baseline.metadata.version,
        reason: 'fallback_no_candidate_selected',
      };
    }

    return {
      role: 'candidate',
      path: bestCandidate.path,
      strategyId: bestCandidate.strategy.metadata.id,
      strategyVersion: bestCandidate.strategy.metadata.version,
      reason: `shadow_candidate_ucb=${bestCandidate.score.toFixed(4)}`,
    };
  }

  async evaluateAutoPromotion(config: LydiaConfig): Promise<ShadowPromotionDecision | null> {
    if (!config.strategy.autoPromoteEnabled) return null;
    if (!config.strategy.shadowModeEnabled) return null;
    if ((config.strategy.shadowRolloutMode ?? 'shadow') !== 'canary') return null;

    const baseline = await this.loadBaseline(config);
    const candidates = await this.loadCandidates(config);
    if (candidates.length === 0) return null;

    const sinceMs = Date.now() - (config.strategy.shadowWindowDays * 24 * 60 * 60 * 1000);
    const baselineSummary = this.memory.summarizeEpisodesByStrategy(
      baseline.metadata.id,
      baseline.metadata.version,
      { sinceMs, limit: 1000 }
    );
    const minTasks = Math.max(1, Math.floor(config.strategy.autoPromoteMinTasks));
    if (baselineSummary.total < minTasks) return null;

    const evalInterval = Math.max(
      1,
      Math.floor(config.strategy.autoPromoteEvalInterval || minTasks)
    );
    if (baselineSummary.total % evalInterval !== 0) return null;

    const confidenceTarget = config.strategy.autoPromoteConfidence;
    const maxPValue = 1 - confidenceTarget;

    const passingDecisions: ShadowPromotionDecision[] = [];

    for (const candidate of candidates) {
      const candidateSummary = this.memory.summarizeEpisodesByStrategy(
        candidate.strategy.metadata.id,
        candidate.strategy.metadata.version,
        { sinceMs, limit: 1000 }
      );
      if (candidateSummary.total < minTasks) continue;
      if (candidateSummary.total % evalInterval !== 0) continue;

      const baselineRate = this.safeRate(baselineSummary.success, baselineSummary.total);
      const candidateRate = this.safeRate(candidateSummary.success, candidateSummary.total);
      const improvement = candidateRate - baselineRate;
      const pValue = this.twoProportionPValue(
        baselineSummary.success,
        baselineSummary.total,
        candidateSummary.success,
        candidateSummary.total
      );

      const durationAcceptable = baselineSummary.avg_duration_ms <= 0 ||
        candidateSummary.avg_duration_ms <= baselineSummary.avg_duration_ms * 1.1;

      if (
        improvement >= config.strategy.autoPromoteMinImprovement &&
        durationAcceptable
      ) {
        passingDecisions.push({
          candidatePath: candidate.path,
          candidateId: candidate.strategy.metadata.id,
          candidateVersion: candidate.strategy.metadata.version,
          baselineId: baseline.metadata.id,
          baselineVersion: baseline.metadata.version,
          candidateSummary,
          baselineSummary,
          successImprovement: improvement,
          pValue,
        });
      }
    }

    if (passingDecisions.length === 0) return null;

    // Holm-Bonferroni control for multiple candidate comparisons in the same check window.
    const sortedByP = [...passingDecisions].sort((a, b) => a.pValue - b.pValue);
    const accepted: ShadowPromotionDecision[] = [];
    for (let i = 0; i < sortedByP.length; i += 1) {
      const remaining = sortedByP.length - i;
      const threshold = maxPValue / remaining;
      if (sortedByP[i].pValue <= threshold) {
        accepted.push(sortedByP[i]);
      } else {
        break;
      }
    }
    if (accepted.length === 0) return null;

    return accepted.sort((a, b) => b.successImprovement - a.successImprovement)[0];
  }

  private async loadBaseline(config: LydiaConfig): Promise<Strategy> {
    if (config.strategy.activePath) {
      return this.registry.loadFromFile(config.strategy.activePath);
    }
    return this.registry.loadDefault();
  }

  private async loadCandidates(config: LydiaConfig): Promise<Array<{ path: string; strategy: Strategy }>> {
    const results: Array<{ path: string; strategy: Strategy }> = [];
    for (const candidatePath of config.strategy.shadowCandidatePaths || []) {
      try {
        const strategy = await this.registry.loadFromFile(candidatePath);
        results.push({ path: candidatePath, strategy });
      } catch {
        // Ignore invalid candidate files.
      }
    }
    return results;
  }

  private computeUcbScore(summary: StrategyEpisodeSummary, globalPulls: number): number {
    if (summary.total === 0) return Number.POSITIVE_INFINITY;
    const successRate = this.safeRate(summary.success, summary.total);
    const pulls = Math.max(1, globalPulls);
    const exploration = Math.sqrt((2 * Math.log(pulls + 1)) / summary.total);
    return successRate + exploration;
  }

  private safeRate(success: number, total: number): number {
    if (total <= 0) return 0;
    return success / total;
  }

  private twoProportionPValue(successA: number, totalA: number, successB: number, totalB: number): number {
    if (totalA <= 0 || totalB <= 0) return 1;
    const p1 = successA / totalA;
    const p2 = successB / totalB;
    const pooled = (successA + successB) / (totalA + totalB);
    const denominator = Math.sqrt(pooled * (1 - pooled) * ((1 / totalA) + (1 / totalB)));
    if (!Number.isFinite(denominator) || denominator === 0) return 1;
    const z = (p2 - p1) / denominator;
    const absZ = Math.abs(z);
    // Normal approximation of two-tailed p-value.
    const p = 2 * (1 - this.normalCdf(absZ));
    if (!Number.isFinite(p)) return 1;
    return Math.max(0, Math.min(1, p));
  }

  private normalCdf(z: number): number {
    // Abramowitz-Stegun approximation.
    const t = 1 / (1 + 0.2316419 * z);
    const d = 0.3989423 * Math.exp(-z * z / 2);
    const prob = 1 - d * t * (
      0.3193815 +
      t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))
    );
    return prob;
  }
}
