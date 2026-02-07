import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { ConfigSchema, type LydiaConfig } from './schema.js';
import { existsSync } from 'node:fs';

export class ConfigLoader {
  private configPath: string;

  constructor() {
    this.configPath = join(homedir(), '.lydia', 'config.json');
  }

  async load(): Promise<LydiaConfig> {
    try {
      if (!existsSync(this.configPath)) {
        // Ensure directory exists
        const dir = join(homedir(), '.lydia');
        if (!existsSync(dir)) {
          await mkdir(dir, { recursive: true });
        }
        return ConfigSchema.parse({});
      }

      const content = await readFile(this.configPath, 'utf-8');
      const raw = JSON.parse(content);
      return ConfigSchema.parse(raw);
    } catch (error) {
      console.warn(`Failed to load config from ${this.configPath}:`, error);
      return ConfigSchema.parse({});
    }
  }

  async update(partial: Partial<LydiaConfig>): Promise<LydiaConfig> {
    const current = await this.load();
      const merged = ConfigSchema.parse({
        ...current,
        ...partial,
        llm: {
          ...(current.llm || {}),
          ...(partial as any).llm
        },
        strategy: {
          ...(current.strategy || {}),
          ...(partial as any).strategy
        },
      safety: {
        ...(current.safety || {}),
        ...(partial as any).safety
      },
      mcpServers: {
        ...(current.mcpServers || {}),
        ...(partial as any).mcpServers
      }
    });

    await this.save(merged);
    return merged;
  }

  private async save(config: LydiaConfig): Promise<void> {
    const dir = join(homedir(), '.lydia');
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    const content = JSON.stringify(config, null, 2);
    await writeFile(this.configPath, content, 'utf-8');
  }
}
