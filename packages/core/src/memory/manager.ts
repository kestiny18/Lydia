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
  strategy_id?: string;
  strategy_version?: string;
  created_at: number;
}

export interface Trace {
  id?: number;
  episode_id?: number;
  step_index: number;
  tool_name: string;
  tool_args: string; // JSON string
  tool_output: string; // JSON string
  duration: number;
  status: 'success' | 'failed';
}

export interface StrategyProposal {
  id?: number;
  strategy_path: string;
  status: 'pending_human' | 'approved' | 'rejected' | 'invalid';
  reason?: string;
  evaluation_json?: string;
  created_at: number;
  decided_at?: number;
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
        strategy_id TEXT,
        strategy_version TEXT,
        created_at INTEGER NOT NULL
      );
    `);

    // Migrate existing DBs if columns are missing
    try {
      const cols = this.db.prepare("PRAGMA table_info(episodes)").all() as any[];
      const hasStrategyId = cols.some(c => c.name === 'strategy_id');
      const hasStrategyVersion = cols.some(c => c.name === 'strategy_version');
      if (!hasStrategyId) {
        this.db.exec("ALTER TABLE episodes ADD COLUMN strategy_id TEXT;");
      }
      if (!hasStrategyVersion) {
        this.db.exec("ALTER TABLE episodes ADD COLUMN strategy_version TEXT;");
      }
    } catch {
      // Ignore migration errors to keep startup resilient
    }

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

    // 5. Traces Table (New for Replay)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS traces (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        episode_id INTEGER NOT NULL,
        step_index INTEGER NOT NULL,
        tool_name TEXT NOT NULL,
        tool_args TEXT NOT NULL,
        tool_output TEXT NOT NULL,
        duration INTEGER NOT NULL,
        status TEXT NOT NULL,
        FOREIGN KEY(episode_id) REFERENCES episodes(id)
      );
    `);

    // 6. Strategy Proposals Table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS strategy_proposals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        strategy_path TEXT NOT NULL,
        status TEXT NOT NULL,
        reason TEXT,
        evaluation_json TEXT,
        created_at INTEGER NOT NULL,
        decided_at INTEGER
      );
    `);

    // Migrate existing DBs if column is missing
    try {
      const cols = this.db.prepare("PRAGMA table_info(strategy_proposals)").all() as any[];
      const hasEval = cols.some(c => c.name === 'evaluation_json');
      if (!hasEval) {
        this.db.exec("ALTER TABLE strategy_proposals ADD COLUMN evaluation_json TEXT;");
      }
    } catch {
      // Ignore migration errors to keep startup resilient
    }
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

    const ftsQuery = `"${query.replace(/"/g, '""')}"`;

    try {
        const rows = stmt.all(ftsQuery, limit) as any[];
        return rows.map(row => ({
            ...row,
            tags: JSON.parse(row.tags || '[]')
        }));
    } catch (e) {
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

  public getFactsByTag(tag: string, limit: number = 100): Fact[] {
      const stmt = this.db.prepare(`
        SELECT * FROM facts
        WHERE tags LIKE ?
        ORDER BY created_at DESC
        LIMIT ?
      `);
      const rows = stmt.all(`%${tag}%`, limit) as any[];
      return rows.map(row => ({
          ...row,
          tags: JSON.parse(row.tags || '[]')
      }));
  }

  public getFactByKey(key: string): Fact | undefined {
      const stmt = this.db.prepare('SELECT * FROM facts WHERE key = ?');
      const row = stmt.get(key) as any;
      if (!row) return undefined;
      return { ...row, tags: JSON.parse(row.tags || '[]') };
  }

  public deleteFactById(id: number): boolean {
      const stmt = this.db.prepare('DELETE FROM facts WHERE id = ?');
      const info = stmt.run(id);
      return info.changes > 0;
  }

  public deleteFactByKey(key: string): boolean {
      const stmt = this.db.prepare('DELETE FROM facts WHERE key = ?');
      const info = stmt.run(key);
      return info.changes > 0;
  }

  /**
   * Record a completed task execution and return its ID
   */
  public recordEpisode(episode: Episode): number {
    const stmt = this.db.prepare(`
      INSERT INTO episodes (input, plan, result, strategy_id, strategy_version, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
      episode.input,
      episode.plan,
      episode.result,
      episode.strategy_id || null,
      episode.strategy_version || null,
      episode.created_at
    );
    return info.lastInsertRowid as number;
  }

  public getEpisode(id: number): Episode | undefined {
    const stmt = this.db.prepare('SELECT * FROM episodes WHERE id = ?');
    return stmt.get(id) as Episode | undefined;
  }

  public listEpisodes(limit: number = 100): Episode[] {
    const stmt = this.db.prepare('SELECT * FROM episodes ORDER BY created_at DESC LIMIT ?');
    return stmt.all(limit) as Episode[];
  }

  public recordStrategyProposal(proposal: StrategyProposal): number {
    const stmt = this.db.prepare(`
      INSERT INTO strategy_proposals (strategy_path, status, reason, evaluation_json, created_at, decided_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
      proposal.strategy_path,
      proposal.status,
      proposal.reason || null,
      proposal.evaluation_json || null,
      proposal.created_at,
      proposal.decided_at || null
    );
    return info.lastInsertRowid as number;
  }

  public updateStrategyProposal(id: number, status: StrategyProposal['status'], reason?: string, evaluation_json?: string): boolean {
    const stmt = this.db.prepare(`
      UPDATE strategy_proposals
      SET status = ?, reason = ?, evaluation_json = ?, decided_at = ?
      WHERE id = ?
    `);
    const info = stmt.run(status, reason || null, evaluation_json || null, Date.now(), id);
    return info.changes > 0;
  }

  public getStrategyProposal(id: number): StrategyProposal | undefined {
    const stmt = this.db.prepare('SELECT * FROM strategy_proposals WHERE id = ?');
    return stmt.get(id) as StrategyProposal | undefined;
  }

  public listStrategyProposals(limit: number = 50): StrategyProposal[] {
    const stmt = this.db.prepare(`
      SELECT * FROM strategy_proposals
      ORDER BY created_at DESC
      LIMIT ?
    `);
    return stmt.all(limit) as StrategyProposal[];
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

  /**
   * Record execution traces for an episode
   */
  public recordTraces(episodeId: number, traces: Trace[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO traces (episode_id, step_index, tool_name, tool_args, tool_output, duration, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction((items: Trace[]) => {
      for (const trace of items) {
        stmt.run(
          episodeId,
          trace.step_index,
          trace.tool_name,
          trace.tool_args,
          trace.tool_output,
          trace.duration,
          trace.status
        );
      }
    });

    transaction(traces);
  }

  public getTraces(episodeId: number): Trace[] {
    const stmt = this.db.prepare('SELECT * FROM traces WHERE episode_id = ? ORDER BY step_index ASC');
    return stmt.all(episodeId) as Trace[];
  }
}
