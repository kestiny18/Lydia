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

export interface StrategyEpisodeSummary {
  strategy_id: string;
  strategy_version: string;
  total: number;
  success: number;
  failure: number;
  avg_duration_ms: number;
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

export interface TaskReportRecord {
  id?: number;
  task_id: string;
  report_json: string;
  created_at: number;
}

export interface TaskFeedbackRecord {
  id?: number;
  task_id: string;
  feedback_json: string;
  created_at: number;
}

/**
 * Checkpoint captures the full execution state of an agentic loop iteration,
 * allowing interrupted tasks to be resumed from the last successful checkpoint.
 */
export interface Checkpoint {
  taskId: string;
  runId: string;
  input: string;
  iteration: number;
  messagesJson: string;     // JSON-serialized Message[]
  tracesJson: string;       // JSON-serialized Trace[]
  systemPrompt: string;
  toolsJson: string;        // JSON-serialized ToolDefinition[]
  taskCreatedAt: number;
  updatedAt: number;
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

    // 7. Task Reports Table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS task_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        report_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);

    // 8. Task Feedback Table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS task_feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        feedback_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);

    // 9. Checkpoints Table — persists agentic loop state for resumable tasks
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS checkpoints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL UNIQUE,
        run_id TEXT NOT NULL,
        input TEXT NOT NULL,
        iteration INTEGER NOT NULL,
        messages_json TEXT NOT NULL,
        traces_json TEXT NOT NULL,
        system_prompt TEXT NOT NULL,
        tools_json TEXT NOT NULL,
        task_created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
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

    // Clean up stale checkpoints (older than 24 hours)
    this.cleanupStaleCheckpoints();
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

  public listEpisodesByStrategy(
    strategyId: string,
    strategyVersion: string,
    options: { limit?: number; sinceMs?: number } = {}
  ): Episode[] {
    const limit = options.limit ?? 200;
    const sinceMs = options.sinceMs ?? 0;
    const stmt = this.db.prepare(`
      SELECT * FROM episodes
      WHERE strategy_id = ? AND strategy_version = ? AND created_at >= ?
      ORDER BY created_at DESC
      LIMIT ?
    `);
    return stmt.all(strategyId, strategyVersion, sinceMs, limit) as Episode[];
  }

  public summarizeEpisodesByStrategy(
    strategyId: string,
    strategyVersion: string,
    options: { limit?: number; sinceMs?: number } = {}
  ): StrategyEpisodeSummary {
    const episodes = this.listEpisodesByStrategy(strategyId, strategyVersion, options);
    if (episodes.length === 0) {
      return {
        strategy_id: strategyId,
        strategy_version: strategyVersion,
        total: 0,
        success: 0,
        failure: 0,
        avg_duration_ms: 0,
      };
    }

    let totalDuration = 0;
    let success = 0;
    let failure = 0;

    for (const episode of episodes) {
      if (!episode.id) continue;
      const traces = this.getTraces(episode.id);
      const duration = traces.reduce((acc, trace) => acc + (trace.duration || 0), 0);
      totalDuration += duration;
      const failed = traces.some((trace) => trace.status === 'failed');
      if (failed) {
        failure += 1;
      } else {
        success += 1;
      }
    }

    return {
      strategy_id: strategyId,
      strategy_version: strategyVersion,
      total: episodes.length,
      success,
      failure,
      avg_duration_ms: Math.round(totalDuration / episodes.length),
    };
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

  public recordTaskReport(taskId: string, report: unknown): number {
    const stmt = this.db.prepare(`
      INSERT INTO task_reports (task_id, report_json, created_at)
      VALUES (?, ?, ?)
    `);
    const info = stmt.run(
      taskId,
      JSON.stringify(report),
      Date.now()
    );
    return info.lastInsertRowid as number;
  }

  public listTaskReports(limit: number = 50): TaskReportRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM task_reports
      ORDER BY created_at DESC
      LIMIT ?
    `);
    return stmt.all(limit) as TaskReportRecord[];
  }

  public recordTaskFeedback(taskId: string, feedback: unknown): number {
    const stmt = this.db.prepare(`
      INSERT INTO task_feedback (task_id, feedback_json, created_at)
      VALUES (?, ?, ?)
    `);
    const info = stmt.run(
      taskId,
      JSON.stringify(feedback),
      Date.now()
    );
    return info.lastInsertRowid as number;
  }

  public listTaskFeedback(limit: number = 50): TaskFeedbackRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM task_feedback
      ORDER BY created_at DESC
      LIMIT ?
    `);
    return stmt.all(limit) as TaskFeedbackRecord[];
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
    } catch (e) {
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

  // ─── Checkpoint CRUD ──────────────────────────────────────────────

  /**
   * Save or update a checkpoint. Uses UPSERT (INSERT OR REPLACE) so each
   * task has at most one checkpoint row, updated in-place every iteration.
   */
  public saveCheckpoint(checkpoint: Checkpoint): void {
    const stmt = this.db.prepare(`
      INSERT INTO checkpoints (task_id, run_id, input, iteration, messages_json, traces_json, system_prompt, tools_json, task_created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(task_id) DO UPDATE SET
        run_id = excluded.run_id,
        iteration = excluded.iteration,
        messages_json = excluded.messages_json,
        traces_json = excluded.traces_json,
        system_prompt = excluded.system_prompt,
        tools_json = excluded.tools_json,
        updated_at = excluded.updated_at
    `);
    stmt.run(
      checkpoint.taskId,
      checkpoint.runId,
      checkpoint.input,
      checkpoint.iteration,
      checkpoint.messagesJson,
      checkpoint.tracesJson,
      checkpoint.systemPrompt,
      checkpoint.toolsJson,
      checkpoint.taskCreatedAt,
      checkpoint.updatedAt,
    );
  }

  /**
   * Load a checkpoint by task ID. Returns null if not found.
   */
  public loadCheckpoint(taskId: string): Checkpoint | null {
    const stmt = this.db.prepare('SELECT * FROM checkpoints WHERE task_id = ?');
    const row = stmt.get(taskId) as any;
    if (!row) return null;
    return {
      taskId: row.task_id,
      runId: row.run_id,
      input: row.input,
      iteration: row.iteration,
      messagesJson: row.messages_json,
      tracesJson: row.traces_json,
      systemPrompt: row.system_prompt,
      toolsJson: row.tools_json,
      taskCreatedAt: row.task_created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Delete a checkpoint after task completion or failure.
   */
  public deleteCheckpoint(taskId: string): boolean {
    const stmt = this.db.prepare('DELETE FROM checkpoints WHERE task_id = ?');
    const info = stmt.run(taskId);
    return info.changes > 0;
  }

  /**
   * List all checkpoints that can be resumed (for UI and CLI).
   */
  public listCheckpoints(): Checkpoint[] {
    const stmt = this.db.prepare('SELECT * FROM checkpoints ORDER BY updated_at DESC');
    const rows = stmt.all() as any[];
    return rows.map((row: any) => ({
      taskId: row.task_id,
      runId: row.run_id,
      input: row.input,
      iteration: row.iteration,
      messagesJson: row.messages_json,
      tracesJson: row.traces_json,
      systemPrompt: row.system_prompt,
      toolsJson: row.tools_json,
      taskCreatedAt: row.task_created_at,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * Remove checkpoints older than the TTL (default: 24 hours).
   */
  public cleanupStaleCheckpoints(ttlMs: number = 24 * 60 * 60 * 1000): number {
    const cutoff = Date.now() - ttlMs;
    const stmt = this.db.prepare('DELETE FROM checkpoints WHERE updated_at < ?');
    const info = stmt.run(cutoff);
    return info.changes;
  }

  // ─── Performance Metrics ────────────────────────────────────────────

  public getPerformanceMetrics(limit: number = 50): { total: number; success: number; failure: number } {
    // We assume an episode is failed if ANY trace is failed, or if we can infer from other data.
    // For simplicity, let's look at the traces.
    // This query counts distinct episodes that have at least one failed trace.
    const stmtFailed = this.db.prepare(`
      SELECT COUNT(DISTINCT episode_id) as count
      FROM traces
      WHERE status = 'failed'
      AND episode_id IN (SELECT id FROM episodes ORDER BY created_at DESC LIMIT ?)
    `);

    const stmtTotal = this.db.prepare(`
      SELECT COUNT(*) as count FROM (SELECT id FROM episodes ORDER BY created_at DESC LIMIT ?)
    `);

    const failed = (stmtFailed.get(limit) as any).count;
    const total = (stmtTotal.get(limit) as any).count;

    return {
      total,
      success: total - failed,
      failure: failed
    };
  }
}
