import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';
import { SkillParser } from './parser.js';
import type { SkillRegistry } from './registry.js';
import type { SkillMeta, StaticSkill } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class SkillLoader {
  private registry: SkillRegistry;
  /** Ordered list of directories to scan for skills */
  private directories: string[] = [];

  constructor(registry: SkillRegistry) {
    this.registry = registry;
  }

  /**
   * Get the list of skill directories in priority order.
   * Later directories override earlier ones (Project > User > Built-in).
   */
  getDirectories(extraDirs: string[] = []): string[] {
    return [
      // 1. Built-in skills (relative to this file in dist/skills)
      path.resolve(__dirname, '../../skills'),
      // 1.5 Built-in skills in source tree (dev mode)
      path.resolve(__dirname, '../skills'),

      // 2. User global skills
      path.join(os.homedir(), '.lydia', 'skills'),

      // 3. Project local skills
      path.join(process.cwd(), '.lydia', 'skills'),

      // 4. Extra directories from config
      ...extraDirs,
    ];
  }

  /**
   * Phase 1: Scan all skill directories and load ONLY frontmatter metadata.
   * Skill content bodies are NOT loaded into memory — they will be
   * lazy-loaded on demand when matched.
   */
  async loadAll(extraDirs: string[] = []) {
    this.directories = this.getDirectories(extraDirs);

    for (const loc of this.directories) {
      await this.loadMetadataFromDirectory(loc);
    }
  }

  /**
   * Recursively scan a directory and register skill metadata (frontmatter only).
   */
  async loadMetadataFromDirectory(dirPath: string) {
    try {
      const stats = await fs.stat(dirPath);
      if (!stats.isDirectory()) return;

      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          // Recursive scan
          await this.loadMetadataFromDirectory(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          // Attempt to load skill metadata
          await this.loadSkillMeta(fullPath);
        }
      }
    } catch (_error) {
      // Ignore errors if directory doesn't exist
    }
  }

  /**
   * Load only the frontmatter metadata from a skill file.
   * The markdown body content is NOT read into memory.
   */
  private async loadSkillMeta(filePath: string) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      // Only try to parse if it looks like a skill (has frontmatter)
      if (content.startsWith('---')) {
        const meta = SkillParser.parseMeta(content, filePath);
        this.registry.register(meta);
      }
    } catch (error) {
      console.warn(`Failed to load skill metadata from ${filePath}:`, error);
    }
  }

  /**
   * Phase 2: On-demand content loading.
   * Reads the full file content for a registered skill and returns
   * the parsed StaticSkill with the markdown body.
   * 
   * @param name - The skill name to load content for
   * @returns The full skill content string, or null if not found
   */
  async loadContent(name: string): Promise<string | null> {
    const meta = this.registry.get(name);
    if (!meta?.path) return null;

    try {
      const fileContent = await fs.readFile(meta.path, 'utf-8');
      const skill = SkillParser.parse(fileContent, meta.path);
      return skill.content;
    } catch (error) {
      console.warn(`Failed to load content for skill "${name}":`, error);
      return null;
    }
  }

  /**
   * Load and return the full StaticSkill object for a given skill name.
   * This reads the file and parses both metadata and content.
   */
  async loadFull(name: string): Promise<StaticSkill | null> {
    const meta = this.registry.get(name);
    if (!meta?.path) return null;

    try {
      const fileContent = await fs.readFile(meta.path, 'utf-8');
      return SkillParser.parse(fileContent, meta.path);
    } catch (error) {
      console.warn(`Failed to load full skill "${name}":`, error);
      return null;
    }
  }

  /**
   * Reload a single skill file's metadata into the registry.
   * Used by the hot-reload watcher on file change.
   */
  async reloadSkillMeta(filePath: string): Promise<SkillMeta | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      if (content.startsWith('---')) {
        const meta = SkillParser.parseMeta(content, filePath);
        this.registry.register(meta);
        return meta;
      }
    } catch (error) {
      console.warn(`Failed to reload skill from ${filePath}:`, error);
    }
    return null;
  }
}
