import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFile, mkdir } from 'node:fs/promises';
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
        return { mcpServers: {} };
      }

      const content = await readFile(this.configPath, 'utf-8');
      const raw = JSON.parse(content);
      return ConfigSchema.parse(raw);
    } catch (error) {
      console.warn(`Failed to load config from ${this.configPath}:`, error);
      return { mcpServers: {} };
    }
  }
}
