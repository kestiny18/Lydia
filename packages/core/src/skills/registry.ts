import type { Skill, SkillMeta } from './types.js';
import { getSkillContent } from './types.js';

// Stopwords to ignore in TF-IDF matching
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'it', 'this', 'that', 'are', 'was',
  'be', 'has', 'have', 'had', 'not', 'you', 'your', 'can', 'will', 'do',
  'does', 'did', 'would', 'should', 'could', 'may', 'might', 'shall',
  'just', 'also', 'than', 'then', 'when', 'what', 'which', 'who', 'how',
  'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some',
  'such', 'only', 'own', 'same', 'so', 'very', 'too', 'any', 'if', 'as',
]);

interface SkillScore {
  skill: Skill | SkillMeta;
  score: number;
}

export class SkillRegistry {
  private skills: Map<string, Skill | SkillMeta> = new Map();
  private relevanceThreshold = 0.1;

  register(skill: Skill | SkillMeta) {
    if (this.skills.has(skill.name)) {
      console.warn(`Overwriting existing skill: ${skill.name}`);
    }
    this.skills.set(skill.name, skill);
  }

  unregister(name: string): boolean {
    return this.skills.delete(name);
  }

  get(name: string): Skill | SkillMeta | undefined {
    return this.skills.get(name);
  }

  list(): (Skill | SkillMeta)[] {
    return Array.from(this.skills.values());
  }

  /**
   * Find relevant skills using TF-IDF weighted scoring.
   * - name match: weight 3.0
   * - tags match: weight 2.5
   * - description match: weight 2.0
   * - content match: weight 1.0 (only if content is in memory)
   * 
   * @param intent - The user's intent/query to match against
   * @param topK - Maximum number of results to return (default: 3)
   * @returns Sorted array of matched skills, limited to topK
   */
  match(intent: string, topK: number = 3): (Skill | SkillMeta)[] {
    const queryTokens = this.tokenize(intent);
    if (queryTokens.length === 0) return [];

    // Compute IDF across all skill documents
    const allSkills = this.list();
    const totalDocs = allSkills.length;
    if (totalDocs === 0) return [];

    const docFreq = new Map<string, number>();
    for (const skill of allSkills) {
      const skillTokens = new Set(this.getSkillTokens(skill));
      for (const token of skillTokens) {
        docFreq.set(token, (docFreq.get(token) || 0) + 1);
      }
    }

    const idf = (term: string): number => {
      const df = docFreq.get(term) || 0;
      return df > 0 ? Math.log(1 + totalDocs / df) : 0;
    };

    // Score each skill
    const scored: SkillScore[] = [];

    for (const skill of allSkills) {
      const nameTokens = this.tokenize(skill.name);
      const descTokens = this.tokenize(skill.description);
      const tagsTokens = this.tokenize((skill.tags || []).join(' '));
      const contentTokens = this.tokenize(getSkillContent(skill));

      let score = 0;

      for (const qt of queryTokens) {
        const termIdf = idf(qt);

        // Name match (highest weight)
        const nameTf = nameTokens.filter(t => t === qt).length / Math.max(nameTokens.length, 1);
        score += nameTf * termIdf * 3.0;

        // Tags match (high weight)
        const tagsTf = tagsTokens.filter(t => t === qt).length / Math.max(tagsTokens.length, 1);
        score += tagsTf * termIdf * 2.5;

        // Description match (medium weight)
        const descTf = descTokens.filter(t => t === qt).length / Math.max(descTokens.length, 1);
        score += descTf * termIdf * 2.0;

        // Content match (base weight, only if content is in memory)
        if (contentTokens.length > 0) {
          const contentTf = contentTokens.filter(t => t === qt).length / Math.max(contentTokens.length, 1);
          score += contentTf * termIdf * 1.0;
        }

        // Partial / prefix match bonus (for compound words like "git-commit")
        if (nameTokens.some(t => t.includes(qt) || qt.includes(t))) {
          score += termIdf * 0.5;
        }

        // Tags partial match bonus
        if (tagsTokens.some(t => t.includes(qt) || qt.includes(t))) {
          score += termIdf * 0.3;
        }
      }

      if (score > this.relevanceThreshold) {
        scored.push({ skill, score });
      }
    }

    // Sort by score descending and limit to topK
    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, topK).map(s => s.skill);
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .split(/[\s,.\-_/|:;!?()[\]{}"']+/)
      .filter(t => t.length > 2 && !STOPWORDS.has(t));
  }

  private getSkillTokens(skill: Skill | SkillMeta): string[] {
    const content = getSkillContent(skill);
    const tags = (skill.tags || []).join(' ');
    return [
      ...this.tokenize(skill.name),
      ...this.tokenize(skill.description),
      ...this.tokenize(tags),
      ...this.tokenize(content),
    ];
  }
}
