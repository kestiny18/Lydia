import Database from 'better-sqlite3';
import { EventEmitter } from 'node:events';

export interface Fact {
  id?: number;
  key?: string;
  content: string;
  tags?: string[];
  created_at: number;
}

export interface Episode {
  id?: number;
  input: string;
  plan: string; // JSON string
  result: string;
  created_at: number;
}

export class MemoryManager extends EventEmitter {
  private db: Database.Database;

  constructor(dbPath: string) {
    super();
    this.db = new Database(dbPath);
    // PRAGMA for performance and reliability
    this.db.pragma('journal_mode = WAL');
    this.init();
  }

  private init() {
    // 1. Facts Table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS facts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE,
        content TEXT NOT NULL,
        tags TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    // 2. FTS for Facts
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS facts_fts USING fts5(content, content='facts');
    `);

    // Trigger to keep FTS in sync (Insert)
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS facts_ai AFTER INSERT ON facts BEGIN
        INSERT INTO facts_fts(rowid, content) VALUES (new.id, new.content);
      END;
    `);

    // Trigger to keep FTS in sync (Delete)
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS facts_ad AFTER DELETE ON facts BEGIN
        INSERT INTO facts_fts(facts_fts, rowid, content) VALUES('delete', old.id, old.content);
      END;
    `);

    // Trigger to keep FTS in sync (Update)
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS facts_au AFTER UPDATE ON facts BEGIN
        INSERT INTO facts_fts(facts_fts, rowid, content) VALUES('delete', old.id, old.content);
        INSERT INTO facts_fts(rowid, content) VALUES (new.id, new.content);
      END;
    `);

    // 3. Episodes Table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS episodes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        input TEXT NOT NULL,
        plan TEXT NOT NULL,
        result TEXT,
        created_at INTEGER NOT NULL
      );
    `);

    // 4. FTS for Episodes
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS episodes_fts USING fts5(input, result, content='episodes');
    `);

    // Trigger for Episodes (Insert)
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS episodes_ai AFTER INSERT ON episodes BEGIN
        INSERT INTO episodes_fts(rowid, input, result) VALUES (new.id, new.input, new.result);
      END;
    `);
  }

  /**
   * Remember a fact. If key is provided and exists, it updates the fact.
   */
  public rememberFact(content: string, key?: string, tags: string[] = []): void {
    const now = Date.now();
    const tagsJson = JSON.stringify(tags);

    if (key) {
      // Upsert
      const stmt = this.db.prepare(`
        INSERT INTO facts (key, content, tags, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          content = excluded.content,
          tags = excluded.tags,
          updated_at = excluded.updated_at
      `);
      stmt.run(key, content, tagsJson, now, now);
    } else {
      // Insert
      const stmt = this.db.prepare(`
        INSERT INTO facts (content, tags, created_at, updated_at)
        VALUES (?, ?, ?, ?)
      `);
      stmt.run(content, tagsJson, now, now);
    }
  }

  /**
   * Search for facts using Full-Text Search
   */
  public searchFacts(query: string, limit: number = 5): Fact[] {
    const stmt = this.db.prepare(`
      SELECT facts.* FROM facts
      JOIN facts_fts ON facts.id = facts_fts.rowid
      WHERE facts_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `);

    // FTS syntax: wrap in quotes for phrase matching or sanitize if needed
    // Simple sanitization for better-sqlite3 binding
    // For FTS5, we need to be careful with syntax. Using "NEAR" or simple tokens.
    // Here we assume simple token matching.
    const ftsQuery = `"${query.replace(/"/g, '""')}"`;

    try {
        const rows = stmt.all(ftsQuery, limit) as any[];
        return rows.map(row => ({
            ...row,
            tags: JSON.parse(row.tags || '[]')
        }));
    } catch (e) {
        // Fallback for empty or invalid queries
        return [];
    }
  }

  public getAllFacts(limit: number = 100): Fact[] {
      const stmt = this.db.prepare('SELECT * FROM facts ORDER BY created_at DESC LIMIT ?');
      const rows = stmt.all(limit) as any[];
      return rows.map(row => ({
          ...row,
          tags: JSON.parse(row.tags || '[]')
      }));
  }

  /**
   * Record a completed task execution
   */
  public recordEpisode(episode: Episode): void {
    const stmt = this.db.prepare(`
      INSERT INTO episodes (input, plan, result, created_at)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(episode.input, episode.plan, episode.result, episode.created_at);
  }

  /**
   * Find relevant past episodes
   */
  public recallEpisodes(query: string, limit: number = 3): Episode[] {
    const stmt = this.db.prepare(`
      SELECT episodes.* FROM episodes
      JOIN episodes_fts ON episodes.id = episodes_fts.rowid
      WHERE episodes_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `);

    const ftsQuery = `"${query.replace(/"/g, '""')}"`;

    try {
        return stmt.all(ftsQuery, limit) as Episode[];
    } catch(e) {
        return [];
    }
  }
}
