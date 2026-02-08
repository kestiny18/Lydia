import type { Skill } from './types.js';

export class SkillRegistry {
  private skills: Map<string, Skill> = new Map();

  register(skill: Skill) {
    if (this.skills.has(skill.name)) {
      console.warn(`Overwriting existing skill: ${skill.name}`);
    }
    this.skills.set(skill.name, skill);
  }

  get(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  list(): Skill[] {
    return Array.from(this.skills.values());
  }

  /**
   * Find relevant skills based on user intent (Simple keyword matching for now)
   * TODO: Implement semantic search/matching using embeddings later
   */
  match(intent: string): Skill[] {
    const normalizedIntent = intent.toLowerCase();
    return this.list().filter(skill => {
      // Basic match: checking if skill name or description keywords appear in intent
      // This is a placeholder for a smarter matching logic
      // Basic match: checking if skill name or description keywords appear in intent
      // This is a placeholder for a smarter matching logic
      const content = (skill as any).content || '';
      const textToSearch = `${skill.name} ${skill.description} ${content}`;
      const keywords = textToSearch.split(/[\s,.]+/);

      return keywords.some(k => k.length > 3 && normalizedIntent.includes(k.toLowerCase()));
    });
  }
}
