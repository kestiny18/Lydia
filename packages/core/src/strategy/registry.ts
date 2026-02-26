import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { StrategySchema, type Strategy, type StrategyConfig } from './strategy.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function mapConfirmationBias(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return undefined;
  const normalized = value.toLowerCase();
  if (normalized === 'high') return 0.9;
  if (normalized === 'medium') return 0.6;
  if (normalized === 'low') return 0.3;
  return undefined;
}

function normalizeCooldown(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return `${value} days`;
  return undefined;
}

function migrateLegacyStrategy(raw: unknown): unknown {
  const source = toRecord(raw);
  if (source.metadata && typeof source.metadata === 'object') {
    return raw;
  }

  const metadata = {
    id: typeof source.id === 'string' ? source.id : 'default',
    version: typeof source.version === 'string' ? source.version : '1.0.0',
    name: typeof source.name === 'string' ? source.name : 'Default Strategy',
    description: typeof source.description === 'string' ? source.description : undefined,
    author: typeof source.author === 'string' ? source.author : undefined,
    inheritFrom: typeof source.inheritFrom === 'string' ? source.inheritFrom : undefined,
  };

  const systemRaw = toRecord(source.system);
  const system = {
    role: typeof systemRaw.role === 'string'
      ? systemRaw.role
      : 'You are a strategic planner for an AI Agent.',
    personality: typeof systemRaw.personality === 'string' ? systemRaw.personality : undefined,
    constraints: Array.isArray(systemRaw.constraints)
      ? (systemRaw.constraints as string[])
      : [],
    goals: Array.isArray(systemRaw.goals)
      ? (systemRaw.goals as string[])
      : [],
  };

  const prompts = source.prompts;
  const planning = source.planning;
  const execution = source.execution;

  const legacyPreferences = toRecord(source.preferences);
  const preferences = {
    riskTolerance:
      typeof legacyPreferences.riskTolerance === 'number'
        ? legacyPreferences.riskTolerance
        : typeof legacyPreferences.risk_tolerance === 'number'
          ? legacyPreferences.risk_tolerance
          : undefined,
    userConfirmation:
      typeof legacyPreferences.userConfirmation === 'number'
        ? legacyPreferences.userConfirmation
        : mapConfirmationBias(legacyPreferences.confirmation_bias),
    autonomyLevel:
      typeof legacyPreferences.autonomyLevel === 'string'
        ? legacyPreferences.autonomyLevel
        : typeof legacyPreferences.autonomy_level === 'string'
          ? legacyPreferences.autonomy_level
          : undefined,
    responseSpeed:
      typeof legacyPreferences.responseSpeed === 'number'
        ? legacyPreferences.responseSpeed
        : typeof legacyPreferences.response_speed === 'number'
          ? legacyPreferences.response_speed
          : undefined,
  };

  const legacyConstraints = toRecord(source.constraints);
  const constraints = {
    mustConfirmBefore: Array.isArray(legacyConstraints.mustConfirmBefore)
      ? legacyConstraints.mustConfirmBefore
      : Array.isArray(legacyConstraints.must_confirm)
        ? legacyConstraints.must_confirm
        : [],
    neverSkipReviewFor: Array.isArray(legacyConstraints.neverSkipReviewFor)
      ? legacyConstraints.neverSkipReviewFor
      : Array.isArray(legacyConstraints.never_skip_review_for)
        ? legacyConstraints.never_skip_review_for
        : [],
    deniedTools: Array.isArray(legacyConstraints.deniedTools)
      ? legacyConstraints.deniedTools
      : Array.isArray(legacyConstraints.denied_tools)
        ? legacyConstraints.denied_tools
        : [],
  };

  const legacyEvolution = toRecord(source.evolution_limits);
  const evolution_limits = {
    maxAutonomyIncrease:
      typeof legacyEvolution.maxAutonomyIncrease === 'number'
        ? legacyEvolution.maxAutonomyIncrease
        : typeof legacyEvolution.max_delta === 'number'
          ? legacyEvolution.max_delta
          : undefined,
    cooldownPeriod:
      normalizeCooldown(legacyEvolution.cooldownPeriod) ??
      normalizeCooldown(legacyEvolution.cooldown_days),
  };

  return {
    metadata,
    system,
    prompts,
    planning,
    execution,
    preferences,
    constraints,
    evolution_limits,
  };
}

export class StrategyRegistry {
  private strategies = new Map<string, Strategy>();
  private activeId: string | null = null;


  public async loadDefault(): Promise<Strategy> {
    const locations = [
      // User Home
      path.join(os.homedir(), '.lydia', 'strategies', 'default.yml'),
      // Package Built-in
      path.resolve(__dirname, '../../strategies/base-v1.yml'),
      // Package Built-in (dev/src)
      path.resolve(__dirname, '../../../strategies/base-v1.yml')
    ];

    for (const loc of locations) {
      try {

        const strategy = await this.loadFromFile(loc);
        this.activeId = strategy.metadata.id;
        return strategy;
      } catch (e) {
        // Continue searching
      }
    }

    throw new Error(`Could not load default strategy from any location: ${locations.join(', ')}`);
  }

  public async listFromDirectory(dirPath: string): Promise<Strategy[]> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const results: Strategy[] = [];

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith('.yml') && !entry.name.endsWith('.yaml')) continue;
      const filePath = path.join(dirPath, entry.name);
      try {
        const strategy = await this.loadFromFile(filePath);
        results.push(strategy);
      } catch {
        // Ignore invalid files
      }
    }

    return results;
  }

  public async loadFromFile(filePath: string): Promise<Strategy> {
    const content = await fs.readFile(filePath, 'utf-8');
    const raw = parseYaml(content);
    const normalized = migrateLegacyStrategy(raw);
    const strategy = StrategySchema.parse(normalized);

    this.strategies.set(strategy.metadata.id, strategy);
    return strategy;
  }

  public async saveToFile(strategy: Strategy, filePath: string): Promise<void> {
    const content = stringifyYaml(strategy);
    await fs.writeFile(filePath, content, 'utf-8');
  }

  public setActive(id: string) {
    if (!this.strategies.has(id)) {
      throw new Error(`Strategy not found: ${id}`);
    }
    this.activeId = id;
  }

  public getActive(): Strategy {
    if (!this.activeId) {
      throw new Error('No active strategy loaded');
    }
    const strategy = this.strategies.get(this.activeId);
    if (!strategy) {
      throw new Error(`Active strategy missing: ${this.activeId}`);
    }
    return strategy;
  }
}
