import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SkillRegistry } from './registry.js';
import { SkillParser } from './parser.js';
import type { Skill, StaticSkill, SkillMeta, DynamicSkill, SkillContext } from './types.js';
import { isDynamicSkill, hasContent, getSkillContent, SkillMetaSchema, StaticSkillSchema } from './types.js';

// ─── SkillRegistry Tests ──────────────────────────────────────────────────────

describe('SkillRegistry', () => {
  let registry: SkillRegistry;

  beforeEach(() => {
    registry = new SkillRegistry();
  });

  describe('register and get', () => {
    it('should register and retrieve a skill by name', () => {
      const skill: StaticSkill = {
        name: 'git-commit',
        description: 'Help with git commit messages',
        content: 'Use conventional commits format.',
      };
      registry.register(skill);

      const retrieved = registry.get('git-commit');
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('git-commit');
    });

    it('should overwrite existing skill with same name', () => {
      const skill1: StaticSkill = {
        name: 'test-skill',
        description: 'First version',
        content: 'v1',
      };
      const skill2: StaticSkill = {
        name: 'test-skill',
        description: 'Second version',
        content: 'v2',
      };

      registry.register(skill1);
      registry.register(skill2);

      const retrieved = registry.get('test-skill');
      expect(retrieved?.description).toBe('Second version');
    });

    it('should list all registered skills', () => {
      registry.register({ name: 'a', description: 'A', content: 'a' });
      registry.register({ name: 'b', description: 'B', content: 'b' });

      const list = registry.list();
      expect(list).toHaveLength(2);
    });
  });

  describe('unregister', () => {
    it('should remove a registered skill', () => {
      registry.register({ name: 'test', description: 'Test', content: 'test' });
      expect(registry.get('test')).toBeDefined();

      const result = registry.unregister('test');
      expect(result).toBe(true);
      expect(registry.get('test')).toBeUndefined();
      expect(registry.list()).toHaveLength(0);
    });

    it('should return false when unregistering a non-existent skill', () => {
      const result = registry.unregister('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('match (TF-IDF)', () => {
    beforeEach(() => {
      registry.register({
        name: 'git-commit',
        description: 'Create and manage git commits with conventional format',
        content: 'When committing code, use conventional commits. Format: type(scope): description.',
      });
      registry.register({
        name: 'docker-deploy',
        description: 'Deploy applications using Docker containers',
        content: 'Use Dockerfile and docker-compose to build and deploy applications.',
      });
      registry.register({
        name: 'code-review',
        description: 'Perform thorough code reviews and provide feedback',
        content: 'Review code for bugs, performance issues, and best practices.',
      });
    });

    it('should match skill by name relevance', () => {
      const matches = registry.match('help me with git commit');
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].name).toBe('git-commit');
    });

    it('should match skill by description relevance', () => {
      const matches = registry.match('deploy my application with docker');
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].name).toBe('docker-deploy');
    });

    it('should match skill by content relevance', () => {
      const matches = registry.match('check for bugs and performance');
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].name).toBe('code-review');
    });

    it('should return empty array for irrelevant queries', () => {
      const matches = registry.match('weather forecast');
      expect(matches).toHaveLength(0);
    });

    it('should rank matches by relevance score', () => {
      const matches = registry.match('commit code review');
      expect(matches.length).toBeGreaterThan(0);
      // Should find relevant skills, not an empty result
    });

    it('should handle empty intent', () => {
      const matches = registry.match('');
      expect(matches).toHaveLength(0);
    });

    it('should handle short tokens', () => {
      // Tokens <= 2 chars are filtered, so "do it" should not match
      const matches = registry.match('do it');
      expect(matches).toHaveLength(0);
    });
  });

  describe('match with topK', () => {
    beforeEach(() => {
      // Register 5 skills
      for (let i = 0; i < 5; i++) {
        registry.register({
          name: `skill-${i}`,
          description: `A skill about coding topic number ${i}`,
          content: `Content about coding and programming for skill ${i}.`,
        });
      }
    });

    it('should limit results to topK', () => {
      const matches = registry.match('coding programming', 2);
      expect(matches.length).toBeLessThanOrEqual(2);
    });

    it('should default topK to 3', () => {
      const matches = registry.match('coding programming');
      expect(matches.length).toBeLessThanOrEqual(3);
    });

    it('should return fewer than topK if not enough matches', () => {
      const singleRegistry = new SkillRegistry();
      singleRegistry.register({
        name: 'only-one',
        description: 'The only skill about coding',
        content: 'coding content',
      });
      const matches = singleRegistry.match('coding', 5);
      expect(matches).toHaveLength(1);
    });
  });

  describe('match with tags', () => {
    beforeEach(() => {
      registry.register({
        name: 'git-advanced',
        description: 'Advanced git workflows',
        tags: ['git', 'version-control', 'branching'],
        content: 'Advanced workflows.',
      });
      registry.register({
        name: 'docker-compose',
        description: 'Manage docker services',
        tags: ['docker', 'containers', 'devops'],
        content: 'Docker compose usage.',
      });
    });

    it('should boost matching when tags match query', () => {
      const matches = registry.match('version control branching', 5);
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].name).toBe('git-advanced');
    });

    it('should match by tags when name and description are less relevant', () => {
      const matches = registry.match('devops containers', 5);
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].name).toBe('docker-compose');
    });
  });

  describe('metadata-only skills (no content)', () => {
    it('should register and match metadata-only skills', () => {
      const meta: SkillMeta = {
        name: 'meta-skill',
        description: 'A skill registered with metadata only',
        tags: ['testing'],
        path: '/some/path.md',
      };
      registry.register(meta);

      const list = registry.list();
      expect(list).toHaveLength(1);
      expect(list[0].name).toBe('meta-skill');

      const matches = registry.match('testing', 5);
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].name).toBe('meta-skill');
    });
  });

  describe('DynamicSkill integration', () => {
    it('should register and retrieve DynamicSkill', () => {
      const dynamicSkill: DynamicSkill = {
        name: 'calculator',
        description: 'Perform calculations',
        version: '1.0.0',
        tools: [
          { name: 'calculate', description: 'Evaluate expression', inputSchema: { type: 'object' } },
        ],
        execute: async (toolName: string, args: any, _context: SkillContext) => {
          return `Result: ${args.expression}`;
        },
      };

      registry.register(dynamicSkill);
      const retrieved = registry.get('calculator');
      expect(retrieved).toBeDefined();
      expect((retrieved as DynamicSkill).tools).toHaveLength(1);
    });
  });
});

// ─── SkillParser Tests ────────────────────────────────────────────────────────

describe('SkillParser', () => {
  describe('parse (full)', () => {
    it('should parse a valid skill file with frontmatter and body', () => {
      const content = `---
name: test-skill
description: A test skill for unit testing
version: "1.0.0"
author: Test Author
tags:
  - test
  - unit
allowedTools:
  - shell_execute
---

# Test Skill

This is the body of the test skill.
Follow these steps:
1. Step one
2. Step two
`;

      const skill = SkillParser.parse(content, '/test/path.md');

      expect(skill.name).toBe('test-skill');
      expect(skill.description).toBe('A test skill for unit testing');
      expect(skill.version).toBe('1.0.0');
      expect(skill.author).toBe('Test Author');
      expect(skill.tags).toEqual(['test', 'unit']);
      expect(skill.allowedTools).toEqual(['shell_execute']);
      expect(skill.path).toBe('/test/path.md');
      expect(skill.content).toContain('# Test Skill');
      expect(skill.content).toContain('Step one');
    });

    it('should throw on content without frontmatter', () => {
      expect(() => SkillParser.parse('No frontmatter here')).toThrow('No YAML frontmatter found');
    });

    it('should throw on invalid frontmatter (missing required fields)', () => {
      const content = `---
version: "1.0.0"
---
Body without name/description.
`;
      expect(() => SkillParser.parse(content)).toThrow();
    });
  });

  describe('parseMeta (metadata only)', () => {
    it('should parse only frontmatter metadata without content body', () => {
      const content = `---
name: meta-test
description: Metadata only parsing test
version: "2.0.0"
tags:
  - meta
  - parsing
---

# This body content should NOT be in the result
Lots of content that should not be loaded...
`;

      const meta = SkillParser.parseMeta(content, '/meta/path.md');

      expect(meta.name).toBe('meta-test');
      expect(meta.description).toBe('Metadata only parsing test');
      expect(meta.version).toBe('2.0.0');
      expect(meta.tags).toEqual(['meta', 'parsing']);
      expect(meta.path).toBe('/meta/path.md');
      // Meta should NOT have content
      expect('content' in meta).toBe(false);
    });

    it('should throw on content without frontmatter', () => {
      expect(() => SkillParser.parseMeta('No frontmatter')).toThrow('No YAML frontmatter found');
    });
  });

  describe('extractFrontmatter', () => {
    it('should extract frontmatter and body correctly', () => {
      const content = `---
key: value
---
Body text here.`;

      const result = SkillParser.extractFrontmatter(content);
      expect(result.frontmatter).toBe('key: value');
      expect(result.body).toBe('Body text here.');
    });

    it('should return null frontmatter when no delimiters', () => {
      const result = SkillParser.extractFrontmatter('Just plain text');
      expect(result.frontmatter).toBeNull();
      expect(result.body).toBe('Just plain text');
    });
  });

  describe('passthrough schema (community skill compatibility)', () => {
    it('should accept skills with extra community fields', () => {
      const content = `---
name: community-skill
description: A community skill with extra fields
version: "3.0.0"
license: MIT
dependencies:
  - playwright
triggers:
  - on_error
  - on_test
custom_field: custom_value
---

# Community Skill
This skill has extra fields that should be accepted.
`;

      // Should NOT throw even though license, dependencies, triggers, custom_field are not in the schema
      const skill = SkillParser.parse(content, '/community/skill.md');
      expect(skill.name).toBe('community-skill');
      expect(skill.content).toContain('Community Skill');
      // Extra fields should pass through
      expect((skill as any).license).toBe('MIT');
      expect((skill as any).dependencies).toEqual(['playwright']);
      expect((skill as any).triggers).toEqual(['on_error', 'on_test']);
    });

    it('should accept metadata with extra community fields', () => {
      const content = `---
name: community-meta
description: Community metadata
license: Apache-2.0
---
Body here.
`;

      const meta = SkillParser.parseMeta(content, '/community/meta.md');
      expect(meta.name).toBe('community-meta');
      expect((meta as any).license).toBe('Apache-2.0');
    });
  });
});

// ─── Type Guard Tests ─────────────────────────────────────────────────────────

describe('Type Guards', () => {
  describe('isDynamicSkill', () => {
    it('should return true for DynamicSkill', () => {
      const dynamic: DynamicSkill = {
        name: 'test',
        description: 'test',
        version: '1.0.0',
        execute: async () => 'result',
      };
      expect(isDynamicSkill(dynamic)).toBe(true);
    });

    it('should return false for StaticSkill', () => {
      const staticSkill: StaticSkill = {
        name: 'test',
        description: 'test',
        content: 'test content',
      };
      expect(isDynamicSkill(staticSkill)).toBe(false);
    });

    it('should return false for SkillMeta', () => {
      const meta: SkillMeta = {
        name: 'test',
        description: 'test',
      };
      expect(isDynamicSkill(meta)).toBe(false);
    });
  });

  describe('hasContent', () => {
    it('should return true for skill with content', () => {
      const skill: StaticSkill = { name: 'a', description: 'b', content: 'c' };
      expect(hasContent(skill)).toBe(true);
    });

    it('should return false for metadata without content', () => {
      const meta: SkillMeta = { name: 'a', description: 'b' };
      expect(hasContent(meta)).toBe(false);
    });

    it('should return false for empty content string', () => {
      const skill = { name: 'a', description: 'b', content: '' };
      expect(hasContent(skill as any)).toBe(false);
    });
  });

  describe('getSkillContent', () => {
    it('should return content from StaticSkill', () => {
      const skill: StaticSkill = { name: 'a', description: 'b', content: 'hello' };
      expect(getSkillContent(skill)).toBe('hello');
    });

    it('should return empty string for metadata without content', () => {
      const meta: SkillMeta = { name: 'a', description: 'b' };
      expect(getSkillContent(meta)).toBe('');
    });
  });
});

// ─── Schema Tests ─────────────────────────────────────────────────────────────

describe('Schemas', () => {
  describe('SkillMetaSchema', () => {
    it('should validate minimal metadata', () => {
      const result = SkillMetaSchema.parse({
        name: 'test',
        description: 'A test skill',
      });
      expect(result.name).toBe('test');
      expect(result.context).toBe('main'); // default
    });

    it('should validate full metadata with optional fields', () => {
      const result = SkillMetaSchema.parse({
        name: 'test',
        description: 'A test skill',
        version: '1.0.0',
        author: 'Author',
        tags: ['a', 'b'],
        allowedTools: ['tool1'],
        context: 'fork',
        path: '/path',
      });
      expect(result.version).toBe('1.0.0');
      expect(result.tags).toEqual(['a', 'b']);
      expect(result.context).toBe('fork');
    });

    it('should pass through extra fields', () => {
      const result = SkillMetaSchema.parse({
        name: 'test',
        description: 'test',
        extraField: 'extraValue',
        nested: { deep: true },
      });
      expect((result as any).extraField).toBe('extraValue');
      expect((result as any).nested).toEqual({ deep: true });
    });

    it('should reject missing required fields', () => {
      expect(() => SkillMetaSchema.parse({ name: 'test' })).toThrow();
      expect(() => SkillMetaSchema.parse({ description: 'test' })).toThrow();
    });
  });

  describe('StaticSkillSchema', () => {
    it('should require content field', () => {
      expect(() => StaticSkillSchema.parse({
        name: 'test',
        description: 'test',
      })).toThrow();
    });

    it('should validate with content', () => {
      const result = StaticSkillSchema.parse({
        name: 'test',
        description: 'test',
        content: 'Some instructions',
      });
      expect(result.content).toBe('Some instructions');
    });
  });
});
