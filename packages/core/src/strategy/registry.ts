import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { parse as parseYaml } from 'yaml';
import { StrategySchema, type Strategy } from './strategy.js';

export class StrategyRegistry {
  private strategies = new Map<string, Strategy>();
  private activeId: string | null = null;

  public async loadDefault(): Promise<Strategy> {
    const defaultPath = path.join(os.homedir(), '.lydia', 'strategies', 'default.yml');
    const strategy = await this.loadFromFile(defaultPath);
    this.activeId = strategy.id;
    return strategy;
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
    const strategy = StrategySchema.parse(raw);
    this.strategies.set(strategy.id, strategy);
    return strategy;
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
