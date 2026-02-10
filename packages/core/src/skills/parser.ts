import { parse as parseYaml } from 'yaml';
import { StaticSkillSchema, SkillMetaSchema, type StaticSkill, type SkillMeta } from './types.js';

export class SkillParser {
  /**
   * Parse a SKILL.md file content into a full StaticSkill object (metadata + content).
   */
  static parse(fileContent: string, filePath?: string): StaticSkill {
    const { frontmatter, body } = this.extractFrontmatter(fileContent);

    if (!frontmatter) {
      throw new Error(`Invalid skill format: No YAML frontmatter found in ${filePath || 'content'}`);
    }

    try {
      const metadata = parseYaml(frontmatter);

      // Combine metadata with body content
      const rawSkill = {
        ...metadata,
        content: body.trim(),
        path: filePath,
      };

      return StaticSkillSchema.parse(rawSkill);
    } catch (error) {
      throw new Error(`Failed to parse skill ${filePath || ''}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Parse only the YAML frontmatter of a SKILL.md file into lightweight SkillMeta.
   * This avoids loading the full content body, saving memory for large skill sets.
   */
  static parseMeta(fileContent: string, filePath?: string): SkillMeta {
    const { frontmatter } = this.extractFrontmatter(fileContent);

    if (!frontmatter) {
      throw new Error(`Invalid skill format: No YAML frontmatter found in ${filePath || 'content'}`);
    }

    try {
      const metadata = parseYaml(frontmatter);

      const rawMeta = {
        ...metadata,
        path: filePath,
      };

      return SkillMetaSchema.parse(rawMeta);
    } catch (error) {
      throw new Error(`Failed to parse skill metadata ${filePath || ''}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Extract YAML frontmatter from markdown content
   */
  static extractFrontmatter(content: string): { frontmatter: string | null; body: string } {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);

    if (!match) {
      return { frontmatter: null, body: content };
    }

    return {
      frontmatter: match[1],
      body: match[2],
    };
  }
}
