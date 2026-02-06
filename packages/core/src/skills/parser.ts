import { parse as parseYaml } from 'yaml';
import { SkillSchema, type Skill } from './types.js';

export class SkillParser {
  /**
   * Parse a SKILL.md file content into a Skill object
   */
  static parse(fileContent: string, filePath?: string): Skill {
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

      return SkillSchema.parse(rawSkill);
    } catch (error) {
      throw new Error(`Failed to parse skill ${filePath || ''}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Extract YAML frontmatter from markdown content
   */
  private static extractFrontmatter(content: string): { frontmatter: string | null; body: string } {
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
