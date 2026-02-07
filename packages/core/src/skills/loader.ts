import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';
import { SkillParser } from './parser.js';
import type { SkillRegistry } from './registry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class SkillLoader {
  private registry: SkillRegistry;

  constructor(registry: SkillRegistry) {
    this.registry = registry;
  }

  async loadFromDirectory(dirPath: string) {
    try {
      const stats = await fs.stat(dirPath);
      if (!stats.isDirectory()) return;

      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          // Recursive scan
          await this.loadFromDirectory(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          // Attempt to load potential skill file
          await this.loadSkillFile(fullPath);
        }
      }
    } catch (error) {
      // Ignore errors if directory doesn't exist
      // console.debug(`Skipping skill load from ${dirPath}:`, error);
    }
  }

  private async loadSkillFile(filePath: string) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      // Only try to parse if it looks like a skill (has frontmatter)
      if (content.startsWith('---')) {
        const skill = SkillParser.parse(content, filePath);
        this.registry.register(skill);
        // console.log(`Loaded skill: ${skill.name} from ${filePath}`);
      }
    } catch (error) {
      console.warn(`Failed to load skill from ${filePath}:`, error);
    }
  }

  async loadAll() {
    const locations = [
      // 1. Built-in skills (relative to this file in dist/skills)
      // Note: In dev mode (ts-node/tsx), this might need adjustment, but for now we assume standard structure
      path.resolve(__dirname, '../../skills'),
      // 1.5 Built-in skills in source tree (dev mode)
      path.resolve(__dirname, '../skills'),

      // 2. User global skills
      path.join(os.homedir(), '.lydia', 'skills'),

      // 3. Project local skills
      path.join(process.cwd(), '.lydia', 'skills')
    ];

    for (const loc of locations) {
      await this.loadFromDirectory(loc);
    }
  }
}
