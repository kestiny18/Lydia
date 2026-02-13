import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createNodeWebSocket } from '@hono/node-ws';
import { MemoryManager, ConfigLoader, Agent, createLLMFromConfig } from '@lydia/core';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import type { WSContext } from 'hono/ws';
import { checkMcpServers } from '../mcp/health.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface RunState {
  runId: string;
  input: string;
  status: 'running' | 'completed' | 'failed';
  taskId?: string;
  result?: string;
  error?: string;
  startedAt: number;
  completedAt?: number;
  pendingPrompt?: { id: string; prompt: string };
  agent?: Agent;
}

// WebSocket message types for real-time event pushing
interface WsMessage {
  type: string;
  data?: any;
  timestamp: number;
}

export function createServer(port: number = 3000, options?: { silent?: boolean }) {
  const app = new Hono();
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

  // Multi-run tracking: keep history of all runs in this session
  const runs: Map<string, RunState> = new Map();
  let activeRunId: string | null = null;

  // WebSocket clients
  const wsClients: Set<WSContext> = new Set();

  function broadcastWs(message: WsMessage) {
    const data = JSON.stringify(message);
    for (const ws of wsClients) {
      try {
        ws.send(data);
      } catch {
        wsClients.delete(ws);
      }
    }
  }

  // WebSocket endpoint for real-time agent events (P2-4)
  app.get('/ws', upgradeWebSocket(() => ({
    onOpen(_event, ws) {
      wsClients.add(ws);
      ws.send(JSON.stringify({
        type: 'connected',
        data: { status: activeRunId ? 'running' : 'idle', activeRunId },
        timestamp: Date.now(),
      }));
    },
    onMessage(event, ws) {
      // Handle client messages if needed (e.g., ping)
      try {
        const msg = JSON.parse(String(event.data));
        if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        }
      } catch {
        // Ignore invalid messages
      }
    },
    onClose(_event, ws) {
      wsClients.delete(ws);
    },
    onError(_event, ws) {
      wsClients.delete(ws);
    },
  })));

  // Initialize MemoryManager
  const dbPath = join(homedir(), '.lydia', 'memory.db');
  const memoryManager = new MemoryManager(dbPath);

  // --- API Routes ---

  // Health check
  app.get('/api/status', (c) => {
    return c.json({
      status: 'ok',
      version: '0.1.0',
      memory_db: dbPath
    });
  });

  // Setup status
  app.get('/api/setup', (c) => {
    const baseDir = join(homedir(), '.lydia');
    const configPath = join(baseDir, 'config.json');
    const strategyPath = join(baseDir, 'strategies', 'default.yml');
    const ready = existsSync(configPath) && existsSync(strategyPath);
    return c.json({
      ready,
      configPath,
      strategyPath
    });
  });

  app.get('/api/mcp/check', async (c) => {
    const config = await new ConfigLoader().load();
    const allServers = Object.entries(config.mcpServers || {});
    const targetServer = c.req.query('server');
    const timeoutMs = Number(c.req.query('timeoutMs')) || 15000;
    const retries = Math.max(0, Number(c.req.query('retries')) || 0);

    const targets = targetServer
      ? allServers.filter(([id]) => id === targetServer)
      : allServers;

    if (targets.length === 0) {
      return c.json({
        ok: false,
        error: targetServer
          ? `MCP server "${targetServer}" not found in config.`
          : 'No external MCP servers configured.',
        results: [],
      }, 404);
    }

    const results = await checkMcpServers(
      targets.map(([id, s]) => ({ id, command: s.command, args: s.args, env: s.env })),
      { timeoutMs, retries }
    );

    return c.json({
      ok: results.every((r) => r.ok),
      timeoutMs,
      retries,
      results,
    });
  });

  // Get Facts
  app.get('/api/memory/facts', (c) => {
    const limit = Number(c.req.query('limit')) || 100;
    const tag = c.req.query('tag');
    const facts = tag ? memoryManager.getFactsByTag(tag, limit) : memoryManager.getAllFacts(limit);
    return c.json(facts);
  });

  // Get Risk Approval Facts
  app.get('/api/memory/approvals', (c) => {
    const limit = Number(c.req.query('limit')) || 100;
    const facts = memoryManager.getFactsByTag('risk_approval', limit);
    return c.json(facts);
  });

  app.delete('/api/memory/approvals/:id', (c) => {
    const id = Number(c.req.param('id'));
    if (Number.isNaN(id)) return c.json({ error: 'Invalid id' }, 400);
    const ok = memoryManager.deleteFactById(id);
    return c.json({ ok });
  });

  app.delete('/api/memory/approvals', (c) => {
    const signature = c.req.query('signature');
    if (!signature) return c.json({ error: 'signature is required' }, 400);
    const key = `risk_approval:${signature}`;
    const ok = memoryManager.deleteFactByKey(key);
    return c.json({ ok });
  });

  // List Episodes
  app.get('/api/replay', (c) => {
    const limit = Number(c.req.query('limit')) || 50;
    const episodes = memoryManager.listEpisodes(limit);
    return c.json(episodes);
  });

  // List Strategy Proposals
  app.get('/api/strategy/proposals', (c) => {
    const limit = Number(c.req.query('limit')) || 50;
    const proposals = memoryManager.listStrategyProposals(limit);
    return c.json(proposals);
  });

  // List Task Reports
  app.get('/api/reports', (c) => {
    const limit = Number(c.req.query('limit')) || 50;
    const reports = memoryManager.listTaskReports(limit);
    return c.json(reports);
  });

  // ─── Task History API (merged: live runs + DB reports) ────────────

  app.get('/api/tasks', (c) => {
    const limit = Number(c.req.query('limit')) || 50;
    const offset = Number(c.req.query('offset')) || 0;
    const statusFilter = c.req.query('status') || '';
    const search = c.req.query('search') || '';

    // 1. Collect live runs from in-memory map
    const liveItems: any[] = [];
    for (const run of runs.values()) {
      liveItems.push({
        id: run.runId,
        input: run.input,
        status: run.status,
        createdAt: run.startedAt,
        duration: run.completedAt ? run.completedAt - run.startedAt : undefined,
        summary: run.result?.substring(0, 120),
        persisted: false,
      });
    }

    // 2. Get persisted task reports from DB
    const dbReports = memoryManager.listTaskReports(limit + 50); // fetch extra to compensate offset
    const dbItems: any[] = dbReports.map((r: any) => {
      let report: any = null;
      try { report = JSON.parse(r.report_json); } catch { /* ignore */ }
      return {
        id: `report-${r.id}`,
        input: report?.intentSummary || r.task_id || 'Unknown task',
        status: report?.success ? 'completed' : 'failed',
        createdAt: r.created_at,
        duration: report?.duration,
        summary: report?.summary || report?.intentSummary,
        persisted: true,
      };
    });

    // 3. Merge and deduplicate (live runs override DB entries with same taskId)
    const liveTaskIds = new Set(liveItems.map(i => i.id));
    const merged = [
      ...liveItems,
      ...dbItems.filter(d => !liveTaskIds.has(d.id)),
    ];

    // 4. Apply filters
    let filtered = merged;
    if (statusFilter) {
      filtered = filtered.filter(i => i.status === statusFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(i =>
        i.input?.toLowerCase().includes(q) || i.summary?.toLowerCase().includes(q)
      );
    }

    // 5. Sort: running first, then by createdAt descending
    filtered.sort((a, b) => {
      if (a.status === 'running' && b.status !== 'running') return -1;
      if (b.status === 'running' && a.status !== 'running') return 1;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });

    // 6. Paginate
    const paginated = filtered.slice(offset, offset + limit);

    return c.json({
      items: paginated,
      total: filtered.length,
      activeRunId,
    });
  });

  // ─── Task Detail API ──────────────────────────────────────────────

  app.get('/api/tasks/:id/detail', (c) => {
    const id = c.req.param('id');

    // Check if it's a live run
    const liveRun = runs.get(id);
    if (liveRun) {
      return c.json({
        id: liveRun.runId,
        input: liveRun.input,
        status: liveRun.status,
        createdAt: liveRun.startedAt,
        completedAt: liveRun.completedAt,
        duration: liveRun.completedAt ? liveRun.completedAt - liveRun.startedAt : undefined,
        result: liveRun.result,
        error: liveRun.error,
        pendingPrompt: liveRun.pendingPrompt,
        report: null,
        traces: null,
        episode: null,
      });
    }

    // Check if it's a DB report (id format: "report-{number}")
    if (id.startsWith('report-')) {
      const reportId = Number(id.slice('report-'.length));
      if (Number.isNaN(reportId)) return c.json({ error: 'Invalid id' }, 400);

      const dbReports = memoryManager.listTaskReports(500);
      const dbReport = dbReports.find((r: any) => r.id === reportId);
      if (!dbReport) return c.json({ error: 'Task not found' }, 404);

      let report: any = null;
      try { report = JSON.parse(dbReport.report_json); } catch { /* ignore */ }

      // Try to find the associated episode
      let episode: any = null;
      let traces: any[] = [];
      if (dbReport.task_id) {
        const episodes = memoryManager.listEpisodes(200);
        episode = episodes.find((e: any) => e.input?.includes(dbReport.task_id)) || null;
        if (episode?.id) {
          const rawTraces = memoryManager.getTraces(episode.id);
          traces = rawTraces.map((t: any) => {
            let args: any = null;
            let output: any = null;
            try { args = JSON.parse(t.tool_args); } catch { /* ignore */ }
            try { output = JSON.parse(t.tool_output); } catch { /* ignore */ }
            return { ...t, args, output };
          });
        }
      }

      return c.json({
        id,
        input: report?.intentSummary || dbReport.task_id || 'Unknown task',
        status: report?.success ? 'completed' : 'failed',
        createdAt: dbReport.created_at,
        completedAt: dbReport.created_at,
        duration: report?.duration,
        report,
        traces: traces.length > 0 ? traces : null,
        episode,
      });
    }

    return c.json({ error: 'Task not found' }, 404);
  });

  // ─── Run Task API (enhanced with multi-run tracking) ──────────────

  app.post('/api/tasks/run', async (c) => {
    if (activeRunId) {
      return c.json({ error: 'A task is already running. Please wait.' }, 409);
    }

    let body: any;
    try {
      body = await c.req.json();
    } catch {
      body = {};
    }

    const inputText = typeof body?.input === 'string' ? body.input.trim() : '';
    if (!inputText) {
      return c.json({ error: 'input is required' }, 400);
    }

    let llm: any;
    try {
      llm = await createLLMFromConfig();
    } catch (error: any) {
      return c.json({ error: error.message || 'Failed to initialize provider.' }, 500);
    }

    const runId = `run-${Date.now()}`;
    const runState: RunState = {
      runId,
      input: inputText,
      status: 'running',
      startedAt: Date.now(),
    };
    runs.set(runId, runState);
    activeRunId = runId;

    try {
      const agent = new Agent(llm);
      runState.agent = agent;

      // Wire up agent events for WebSocket broadcasting
      agent.on('task:start', (task) => {
        runState.taskId = task.id;
        broadcastWs({ type: 'task:start', data: { runId, taskId: task.id, description: task.description }, timestamp: Date.now() });
      });

      agent.on('stream:text', (text: string) => {
        broadcastWs({ type: 'stream:text', data: { runId, text }, timestamp: Date.now() });
      });

      agent.on('stream:thinking', (thinking: string) => {
        broadcastWs({ type: 'stream:thinking', data: { runId, thinking }, timestamp: Date.now() });
      });

      agent.on('message', (msg) => {
        broadcastWs({ type: 'message', data: { runId, ...msg }, timestamp: Date.now() });
      });

      agent.on('tool:start', (data) => {
        broadcastWs({ type: 'tool:start', data: { runId, ...data }, timestamp: Date.now() });
      });

      agent.on('tool:complete', (data) => {
        broadcastWs({ type: 'tool:complete', data: { runId, ...data }, timestamp: Date.now() });
      });

      agent.on('tool:error', (data) => {
        broadcastWs({ type: 'tool:error', data: { runId, ...data }, timestamp: Date.now() });
      });

      agent.on('retry', (data) => {
        broadcastWs({ type: 'retry', data: { runId, ...data }, timestamp: Date.now() });
      });

      agent.on('interaction_request', (req) => {
        runState.pendingPrompt = { id: req.id, prompt: req.prompt };
        broadcastWs({ type: 'interaction_request', data: { runId, id: req.id, prompt: req.prompt }, timestamp: Date.now() });
      });

      agent.on('checkpoint:saved', (data) => {
        broadcastWs({ type: 'checkpoint:saved', data: { runId, ...data }, timestamp: Date.now() });
      });

      agent.run(inputText, runId)
        .then((task) => {
          runState.taskId = task.id;
          runState.status = task.status === 'completed' ? 'completed' : 'failed';
          runState.result = task.result;
          runState.completedAt = Date.now();
          runState.pendingPrompt = undefined;
          broadcastWs({ type: 'task:complete', data: { runId, taskId: task.id, status: task.status, result: task.result }, timestamp: Date.now() });
        })
        .catch((error: any) => {
          runState.status = 'failed';
          runState.error = error?.message || 'Task failed.';
          runState.completedAt = Date.now();
          runState.pendingPrompt = undefined;
          broadcastWs({ type: 'task:error', data: { runId, error: runState.error }, timestamp: Date.now() });
        })
        .finally(() => {
          activeRunId = null;
          // Clean up agent reference to free memory, keep run state for history
          runState.agent = undefined;
        });

      return c.json({ runId });
    } catch (error: any) {
      activeRunId = null;
      runs.delete(runId);
      return c.json({ error: error.message || 'Task failed.' }, 500);
    }
  });

  // ─── Run Status (legacy + enhanced) ───────────────────────────────

  app.get('/api/tasks/:id/status', (c) => {
    const runId = c.req.param('id');
    const run = runs.get(runId);
    if (!run) {
      return c.json({ error: 'Task not found' }, 404);
    }
    return c.json({
      runId: run.runId,
      input: run.input,
      status: run.status,
      taskId: run.taskId,
      result: run.result,
      error: run.error,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      duration: run.completedAt ? run.completedAt - run.startedAt : Date.now() - run.startedAt,
      pendingPrompt: run.pendingPrompt,
    });
  });

  app.post('/api/tasks/:id/respond', async (c) => {
    const runId = c.req.param('id');
    const run = runs.get(runId);
    if (!run) {
      return c.json({ error: 'Task not found' }, 404);
    }
    if (!run.pendingPrompt) {
      return c.json({ error: 'No pending prompt' }, 409);
    }

    let body: any;
    try {
      body = await c.req.json();
    } catch {
      body = {};
    }
    const response = typeof body?.response === 'string' ? body.response.trim() : '';
    if (!response) {
      return c.json({ error: 'response is required' }, 400);
    }

    if (!run.agent) {
      return c.json({ error: 'Agent not available' }, 500);
    }

    const promptId = run.pendingPrompt.id;
    run.pendingPrompt = undefined;
    run.agent.resolveInteraction(promptId, response);

    return c.json({ ok: true });
  });

  // ─── Checkpoint / Resume API ─────────────────────────────────────

  app.get('/api/tasks/resumable', (c) => {
    const checkpoints = memoryManager.listCheckpoints();
    const items = checkpoints.map((cp) => ({
      taskId: cp.taskId,
      runId: cp.runId,
      input: cp.input,
      iteration: cp.iteration,
      taskCreatedAt: cp.taskCreatedAt,
      updatedAt: cp.updatedAt,
    }));
    return c.json({ items });
  });

  app.post('/api/tasks/:id/resume', async (c) => {
    if (activeRunId) {
      return c.json({ error: 'A task is already running. Please wait.' }, 409);
    }

    const taskId = c.req.param('id');

    // Verify checkpoint exists
    const checkpoint = memoryManager.loadCheckpoint(taskId);
    if (!checkpoint) {
      return c.json({ error: 'No checkpoint found for this task.' }, 404);
    }

    let llm: any;
    try {
      llm = await createLLMFromConfig();
    } catch (error: any) {
      return c.json({ error: error.message || 'Failed to initialize provider.' }, 500);
    }

    const runId = checkpoint.runId || `resume-${Date.now()}`;
    const runState: RunState = {
      runId,
      input: checkpoint.input,
      status: 'running',
      startedAt: Date.now(),
      taskId: checkpoint.taskId,
    };
    runs.set(runId, runState);
    activeRunId = runId;

    try {
      const agent = new Agent(llm);
      runState.agent = agent;

      // Wire up agent events (same as /api/tasks/run)
      agent.on('task:resume', (data) => {
        broadcastWs({ type: 'task:resume', data: { runId, ...data }, timestamp: Date.now() });
      });

      agent.on('stream:text', (text: string) => {
        broadcastWs({ type: 'stream:text', data: { runId, text }, timestamp: Date.now() });
      });

      agent.on('stream:thinking', (thinking: string) => {
        broadcastWs({ type: 'stream:thinking', data: { runId, thinking }, timestamp: Date.now() });
      });

      agent.on('message', (msg) => {
        broadcastWs({ type: 'message', data: { runId, ...msg }, timestamp: Date.now() });
      });

      agent.on('tool:start', (data) => {
        broadcastWs({ type: 'tool:start', data: { runId, ...data }, timestamp: Date.now() });
      });

      agent.on('tool:complete', (data) => {
        broadcastWs({ type: 'tool:complete', data: { runId, ...data }, timestamp: Date.now() });
      });

      agent.on('tool:error', (data) => {
        broadcastWs({ type: 'tool:error', data: { runId, ...data }, timestamp: Date.now() });
      });

      agent.on('retry', (data) => {
        broadcastWs({ type: 'retry', data: { runId, ...data }, timestamp: Date.now() });
      });

      agent.on('interaction_request', (req) => {
        runState.pendingPrompt = { id: req.id, prompt: req.prompt };
        broadcastWs({ type: 'interaction_request', data: { runId, id: req.id, prompt: req.prompt }, timestamp: Date.now() });
      });

      agent.on('checkpoint:saved', (data) => {
        broadcastWs({ type: 'checkpoint:saved', data: { runId, ...data }, timestamp: Date.now() });
      });

      agent.resume(taskId)
        .then((task) => {
          runState.taskId = task.id;
          runState.status = task.status === 'completed' ? 'completed' : 'failed';
          runState.result = task.result;
          runState.completedAt = Date.now();
          runState.pendingPrompt = undefined;
          broadcastWs({ type: 'task:complete', data: { runId, taskId: task.id, status: task.status, result: task.result }, timestamp: Date.now() });
        })
        .catch((error: any) => {
          runState.status = 'failed';
          runState.error = error?.message || 'Resume failed.';
          runState.completedAt = Date.now();
          runState.pendingPrompt = undefined;
          broadcastWs({ type: 'task:error', data: { runId, error: runState.error }, timestamp: Date.now() });
        })
        .finally(() => {
          activeRunId = null;
          runState.agent = undefined;
        });

      return c.json({ runId, resumed: true, fromIteration: checkpoint.iteration });
    } catch (error: any) {
      activeRunId = null;
      runs.delete(runId);
      return c.json({ error: error.message || 'Resume failed.' }, 500);
    }
  });

  // ─── Chat Session API (P1-1) ──────────────────────────────────────

  const chatSessions: Map<string, { agent: Agent; createdAt: number }> = new Map();

  app.post('/api/chat/start', async (c) => {
    let llm: any;
    try {
      llm = await createLLMFromConfig();
    } catch (error: any) {
      return c.json({ error: error.message }, 500);
    }

    const sessionId = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const agent = new Agent(llm);
    chatSessions.set(sessionId, { agent, createdAt: Date.now() });

    return c.json({ sessionId });
  });

  app.post('/api/chat/:id/message', async (c) => {
    const sessionId = c.req.param('id');
    const session = chatSessions.get(sessionId);
    if (!session) return c.json({ error: 'Session not found' }, 404);

    let body: any;
    try { body = await c.req.json(); } catch { body = {}; }
    const message = typeof body?.message === 'string' ? body.message.trim() : '';
    if (!message) return c.json({ error: 'message is required' }, 400);

    try {
      const response = await session.agent.chat(message);
      return c.json({ response });
    } catch (error: any) {
      return c.json({ error: error.message || 'Chat failed.' }, 500);
    }
  });

  app.delete('/api/chat/:id', (c) => {
    const sessionId = c.req.param('id');
    const deleted = chatSessions.delete(sessionId);
    return c.json({ ok: deleted });
  });

  // Get Active Strategy Content
  app.get('/api/strategy/active', async (c) => {
    const loader = new ConfigLoader();
    const config = await loader.load();
    const fallbackPath = join(homedir(), '.lydia', 'strategies', 'default.yml');
    const activePath = config.strategy?.activePath || fallbackPath;

    try {
      if (!existsSync(activePath)) {
        return c.json({ error: 'Active strategy not found', path: activePath }, 404);
      }
      const content = await readFile(activePath, 'utf-8');
      return c.json({ path: activePath, content });
    } catch {
      return c.json({ error: 'Failed to read active strategy' }, 500);
    }
  });

  app.post('/api/strategy/proposals/:id/approve', async (c) => {
    const id = Number(c.req.param('id'));
    if (Number.isNaN(id)) return c.json({ error: 'Invalid id' }, 400);
    const proposal = memoryManager.getStrategyProposal(id);
    if (!proposal) return c.json({ error: 'Proposal not found' }, 404);
    if (proposal.status !== 'pending_human') {
      return c.json({ error: `Proposal is ${proposal.status}` }, 400);
    }

    const loader = new ConfigLoader();
    await loader.update({ strategy: { activePath: proposal.strategy_path } } as any);
    memoryManager.updateStrategyProposal(id, 'approved');
    return c.json({ ok: true });
  });

  app.post('/api/strategy/proposals/:id/reject', async (c) => {
    const id = Number(c.req.param('id'));
    if (Number.isNaN(id)) return c.json({ error: 'Invalid id' }, 400);
    const proposal = memoryManager.getStrategyProposal(id);
    if (!proposal) return c.json({ error: 'Proposal not found' }, 404);
    if (proposal.status !== 'pending_human') {
      return c.json({ error: `Proposal is ${proposal.status}` }, 400);
    }

    let reason = '';
    try {
      const body = await c.req.json();
      reason = body?.reason || '';
    } catch { }

    memoryManager.updateStrategyProposal(id, 'rejected', reason);
    return c.json({ ok: true });
  });

  // Get Replay Traces (Episodes)
  app.get('/api/replay/:id', (c) => {
    const id = Number(c.req.param('id'));
    const episode = memoryManager.getEpisode(id);

    if (!episode) return c.json({ error: 'Episode not found' }, 404);

    const traces = memoryManager.getTraces(id);
    const summary = {
      total: traces.length,
      success: traces.filter(t => t.status === 'success').length,
      failed: traces.filter(t => t.status === 'failed').length,
    };
    const traceDetails = traces.map((t) => {
      let args: any = null;
      let output: any = null;
      try {
        args = JSON.parse(t.tool_args);
      } catch { }
      try {
        output = JSON.parse(t.tool_output);
      } catch { }
      return {
        ...t,
        args,
        output,
      };
    });
    return c.json({ episode, traces: traceDetails, summary });
  });

  // Get Strategy Content
  app.get('/api/strategy/content', async (c) => {
    const filePath = c.req.query('path');
    if (!filePath) return c.json({ error: 'path is required' }, 400);

    // Security check: ensure path is within .lydia/strategies
    const strategiesDir = join(homedir(), '.lydia', 'strategies');
    const resolvedPath = join(dirname(filePath), '..', filePath); // Handle potential relative paths if any, but usually absolute
    // Actually, let's just use the absolute path standard logic
    // The path stored in DB is likely absolute.

    // Simple check:
    if (!filePath.includes('.lydia') || !filePath.includes('strategies')) {
      return c.json({ error: 'Access denied: Path must be within .lydia/strategies' }, 403);
    }

    try {
      if (!existsSync(filePath)) return c.json({ error: 'File not found' }, 404);
      const content = await readFile(filePath, 'utf-8');
      return c.json({ content });
    } catch (e) {
      return c.json({ error: 'Failed to read file' }, 500);
    }
  });

  // --- Static Files ---
  // Serve the dashboard frontend from dist/
  // In dev/monorepo, we might need to point to packages/dashboard/dist
  // In production build, we assume it's copied to ../public or similar.

  // For this MVP, let's assume we will build dashboard to packages/cli/public
  const publicDir = join(__dirname, '../../public');

  app.get('/*', async (c) => {
    const path = c.req.path === '/' ? '/index.html' : c.req.path;
    const filePath = join(publicDir, path);

    // API requests should already be handled.
    if (path.startsWith('/api')) return c.json({ error: 'Not found' }, 404);

    try {
      if (existsSync(filePath)) {
        const content = await readFile(filePath);
        // Basic MIME types
        if (path.endsWith('.html')) c.header('Content-Type', 'text/html');
        if (path.endsWith('.js')) c.header('Content-Type', 'application/javascript');
        if (path.endsWith('.css')) c.header('Content-Type', 'text/css');
        return c.body(content);
      } else {
        // SPA Fallback
        const indexHtml = join(publicDir, 'index.html');
        if (existsSync(indexHtml)) {
          const content = await readFile(indexHtml);
          c.header('Content-Type', 'text/html');
          return c.body(content);
        }
        return c.text('Dashboard not found. Please run "pnpm build:dashboard" first.', 404);
      }
    } catch (e) {
      return c.text('Internal Server Error', 500);
    }
  });

  return {
    start: () => {
      if (!options?.silent) {
        console.log(`Starting server on port ${port}...`);
      }
      const server = serve({
        fetch: app.fetch,
        port
      });
      injectWebSocket(server);
    }
  };
}
