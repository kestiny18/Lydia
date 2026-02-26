import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createNodeWebSocket } from '@hono/node-ws';
import {
  MemoryManager,
  ConfigLoader,
  Agent,
  StrategyRegistry,
  StrategyApprovalService,
  ShadowRouter,
  createLLMFromConfig,
} from '@lydia/core';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
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
  strategyPath?: string;
  strategyRole?: 'baseline' | 'candidate';
  strategyId?: string;
  strategyVersion?: string;
}

// WebSocket message types for real-time event pushing
interface WsMessage {
  type: string;
  data?: any;
  timestamp: number;
}

function getSetupPaths() {
  const baseDir = join(homedir(), '.lydia');
  const strategiesDir = join(baseDir, 'strategies');
  const skillsDir = join(baseDir, 'skills');
  const configPath = join(baseDir, 'config.json');
  const strategyPath = join(strategiesDir, 'default.yml');
  return { baseDir, strategiesDir, skillsDir, configPath, strategyPath };
}

function maskSecret(value?: string): string {
  if (!value) return '';
  if (value.length <= 8) return '*'.repeat(value.length);
  return `${value.slice(0, 4)}${'*'.repeat(Math.max(4, value.length - 8))}${value.slice(-4)}`;
}

function pickString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return value.trim();
}

async function ensureLocalWorkspace() {
  const { strategiesDir, skillsDir, configPath, strategyPath } = getSetupPaths();
  await mkdir(strategiesDir, { recursive: true });
  await mkdir(skillsDir, { recursive: true });

  const loader = new ConfigLoader();
  if (!existsSync(configPath)) {
    const config = await loader.load();
    await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
  }

  if (!existsSync(strategyPath)) {
    const registry = new StrategyRegistry();
    const strategy = await registry.loadDefault();
    const initial = {
      ...strategy,
      metadata: {
        ...strategy.metadata,
        id: 'default',
        version: '1.0.0',
        name: 'Default Strategy',
      },
    };
    await registry.saveToFile(initial as any, strategyPath);
  }

  const config = await loader.load();
  if (!config.strategy.activePath) {
    await loader.update({ strategy: { activePath: strategyPath } } as any);
  }

  return getSetupPaths();
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
  const approvalService = new StrategyApprovalService(memoryManager, new ConfigLoader());
  const shadowRouter = new ShadowRouter(memoryManager);

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
  app.get('/api/setup', async (c) => {
    const { configPath, strategyPath } = getSetupPaths();
    const ready = existsSync(configPath) && existsSync(strategyPath);
    const config = await new ConfigLoader().load();
    const hasConfiguredKey = Boolean(config.llm.openaiApiKey || config.llm.anthropicApiKey);
    const hasEnvKey = Boolean(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);
    return c.json({
      ready,
      configPath,
      strategyPath,
      llmConfigured: hasConfiguredKey || hasEnvKey,
      provider: config.llm.provider || 'auto',
    });
  });

  app.post('/api/setup/init', async (c) => {
    try {
      const paths = await ensureLocalWorkspace();
      return c.json({
        ok: true,
        ready: existsSync(paths.configPath) && existsSync(paths.strategyPath),
        ...paths,
      });
    } catch (error: any) {
      return c.json({ error: error?.message || 'Failed to initialize workspace.' }, 500);
    }
  });

  app.get('/api/setup/config', async (c) => {
    const { configPath, strategyPath } = getSetupPaths();
    const config = await new ConfigLoader().load();

    const openaiKey = config.llm.openaiApiKey || process.env.OPENAI_API_KEY || '';
    const anthropicKey = config.llm.anthropicApiKey || process.env.ANTHROPIC_API_KEY || '';

    return c.json({
      ready: existsSync(configPath) && existsSync(strategyPath),
      llm: {
        provider: config.llm.provider,
        defaultModel: config.llm.defaultModel,
        fallbackOrder: config.llm.fallbackOrder,
        openaiBaseUrl: config.llm.openaiBaseUrl,
        anthropicBaseUrl: config.llm.anthropicBaseUrl,
        ollamaBaseUrl: config.llm.ollamaBaseUrl,
        openaiApiKeySet: Boolean(openaiKey),
        anthropicApiKeySet: Boolean(anthropicKey),
        openaiApiKeyMasked: maskSecret(openaiKey),
        anthropicApiKeyMasked: maskSecret(anthropicKey),
      },
    });
  });

  app.post('/api/setup/config', async (c) => {
    let body: any;
    try {
      body = await c.req.json();
    } catch {
      body = {};
    }

    const llmInput = body?.llm || {};
    const provider = pickString(llmInput.provider);
    const defaultModel = pickString(llmInput.defaultModel);
    const openaiBaseUrl = pickString(llmInput.openaiBaseUrl);
    const anthropicBaseUrl = pickString(llmInput.anthropicBaseUrl);
    const ollamaBaseUrl = pickString(llmInput.ollamaBaseUrl);
    const fallbackOrder = Array.isArray(llmInput.fallbackOrder)
      ? llmInput.fallbackOrder.filter((item: unknown) => typeof item === 'string')
      : undefined;

    const providerSet = new Set(['anthropic', 'openai', 'ollama', 'mock', 'auto']);
    if (provider && !providerSet.has(provider)) {
      return c.json({ error: `Unsupported provider: ${provider}` }, 400);
    }

    const updateLlm: Record<string, unknown> = {};
    if (provider !== undefined) updateLlm.provider = provider;
    if (defaultModel !== undefined) updateLlm.defaultModel = defaultModel;
    if (fallbackOrder !== undefined) updateLlm.fallbackOrder = fallbackOrder;
    if (openaiBaseUrl !== undefined) updateLlm.openaiBaseUrl = openaiBaseUrl;
    if (anthropicBaseUrl !== undefined) updateLlm.anthropicBaseUrl = anthropicBaseUrl;
    if (ollamaBaseUrl !== undefined) updateLlm.ollamaBaseUrl = ollamaBaseUrl;

    if (Object.prototype.hasOwnProperty.call(llmInput, 'openaiApiKey')) {
      updateLlm.openaiApiKey = String(llmInput.openaiApiKey || '').trim();
    }
    if (Object.prototype.hasOwnProperty.call(llmInput, 'anthropicApiKey')) {
      updateLlm.anthropicApiKey = String(llmInput.anthropicApiKey || '').trim();
    }

    try {
      const next = await new ConfigLoader().update({ llm: updateLlm } as any);
      return c.json({
        ok: true,
        llm: {
          provider: next.llm.provider,
          defaultModel: next.llm.defaultModel,
          fallbackOrder: next.llm.fallbackOrder,
          openaiBaseUrl: next.llm.openaiBaseUrl,
          anthropicBaseUrl: next.llm.anthropicBaseUrl,
          ollamaBaseUrl: next.llm.ollamaBaseUrl,
          openaiApiKeySet: Boolean(next.llm.openaiApiKey),
          anthropicApiKeySet: Boolean(next.llm.anthropicApiKey),
          openaiApiKeyMasked: maskSecret(next.llm.openaiApiKey),
          anthropicApiKeyMasked: maskSecret(next.llm.anthropicApiKey),
        },
      });
    } catch (error: any) {
      return c.json({ error: error?.message || 'Failed to update setup config.' }, 400);
    }
  });

  app.post('/api/setup/test-llm', async (c) => {
    let body: any;
    try {
      body = await c.req.json();
    } catch {
      body = {};
    }
    const probe = Boolean(body?.probe);

    try {
      const llm = await createLLMFromConfig();
      if (probe) {
        const timeoutMs = Number(body?.timeoutMs) > 0 ? Number(body.timeoutMs) : 15000;
        const response = await Promise.race([
          llm.generate({
            messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
            max_tokens: 16,
            temperature: 0,
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('LLM probe timeout')), timeoutMs)),
        ]);

        const text = (response as any)?.content
          ?.filter((block: any) => block.type === 'text')
          ?.map((block: any) => block.text)
          ?.join('\n')
          ?.trim?.() || '';
        return c.json({ ok: true, provider: llm.id, probeText: text.slice(0, 200) });
      }

      return c.json({ ok: true, provider: llm.id });
    } catch (error: any) {
      return c.json({ ok: false, error: error?.message || 'Failed to initialize provider.' }, 400);
    }
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
    const proposals = memoryManager.listStrategyProposals(limit).map((proposal) => {
      let evaluationSummary: any = null;
      if (proposal.evaluation_json) {
        try {
          const evaluation = JSON.parse(proposal.evaluation_json);
          const replay = evaluation?.replay;
          if (replay?.candidateSummary && replay?.baselineSummary && replay?.delta) {
            evaluationSummary = {
              candidateScore: replay.candidateScore,
              baselineScore: replay.baselineScore,
              tasksEvaluated: replay.tasksEvaluated,
              candidateSummary: replay.candidateSummary,
              baselineSummary: replay.baselineSummary,
              delta: replay.delta,
              validation: evaluation?.validation || null,
            };
          } else if (evaluation?.validation) {
            evaluationSummary = { validation: evaluation.validation };
          }
        } catch {
          evaluationSummary = null;
        }
      }
      return {
        ...proposal,
        evaluationSummary,
      };
    });
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
      const currentConfig = await new ConfigLoader().load();
      const routedStrategy = await shadowRouter.selectStrategy(currentConfig);
      const agent = new Agent(
        llm,
        routedStrategy.path ? { strategyPathOverride: routedStrategy.path } : {}
      );
      runState.agent = agent;
      runState.strategyPath = routedStrategy.path;
      runState.strategyRole = routedStrategy.role;
      runState.strategyId = routedStrategy.strategyId;
      runState.strategyVersion = routedStrategy.strategyVersion;

      // Wire up agent events for WebSocket broadcasting
      agent.on('task:start', (task) => {
        runState.taskId = task.id;
        broadcastWs({
          type: 'task:start',
          data: {
            runId,
            taskId: task.id,
            description: task.description,
            strategy: {
              role: routedStrategy.role,
              path: routedStrategy.path,
              id: routedStrategy.strategyId,
              version: routedStrategy.strategyVersion,
              reason: routedStrategy.reason,
            }
          },
          timestamp: Date.now()
        });
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
        .then(async (task) => {
          runState.taskId = task.id;
          runState.status = task.status === 'completed' ? 'completed' : 'failed';
          runState.result = task.result;
          runState.completedAt = Date.now();
          runState.pendingPrompt = undefined;

          try {
            const latestConfig = await new ConfigLoader().load();
            const promotion = await shadowRouter.evaluateAutoPromotion(latestConfig);
            if (promotion) {
              const nextCandidates = (latestConfig.strategy.shadowCandidatePaths || [])
                .filter((p) => p !== promotion.candidatePath);
              await new ConfigLoader().update({
                strategy: {
                  activePath: promotion.candidatePath,
                  shadowCandidatePaths: nextCandidates,
                }
              } as any);
              memoryManager.rememberFact(
                JSON.stringify({
                  promotedAt: Date.now(),
                  candidatePath: promotion.candidatePath,
                  candidateId: promotion.candidateId,
                  candidateVersion: promotion.candidateVersion,
                  baselineId: promotion.baselineId,
                  baselineVersion: promotion.baselineVersion,
                  successImprovement: promotion.successImprovement,
                  pValue: promotion.pValue,
                }),
                `strategy.autopromote.${Date.now()}`,
                ['strategy', 'shadow', 'autopromote']
              );
              broadcastWs({
                type: 'strategy:autopromote',
                data: {
                  runId,
                  candidatePath: promotion.candidatePath,
                  candidateId: promotion.candidateId,
                  candidateVersion: promotion.candidateVersion,
                  successImprovement: promotion.successImprovement,
                  pValue: promotion.pValue,
                },
                timestamp: Date.now()
              });
            }
          } catch {
            // Ignore auto-promotion failures; task result should still be returned.
          }

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
      strategyPath: run.strategyPath,
      strategyRole: run.strategyRole,
      strategyId: run.strategyId,
      strategyVersion: run.strategyVersion,
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
    try {
      const result = await approvalService.approveProposal(id);
      return c.json({ ok: true, activePath: result.activePath });
    } catch (error: any) {
      const message = error?.message || 'Approval failed';
      if (message === 'Proposal not found') return c.json({ error: message }, 404);
      return c.json({ error: message }, 400);
    }
  });

  app.get('/api/strategy/shadow/status', async (c) => {
    const config = await new ConfigLoader().load();
    const registry = new StrategyRegistry();
    const windowDays = config.strategy.shadowWindowDays ?? 14;
    const sinceMs = Date.now() - (windowDays * 24 * 60 * 60 * 1000);

    const baseline = config.strategy.activePath
      ? await registry.loadFromFile(config.strategy.activePath)
      : await registry.loadDefault();
    const baselineSummary = memoryManager.summarizeEpisodesByStrategy(
      baseline.metadata.id,
      baseline.metadata.version,
      { sinceMs, limit: 1000 }
    );

    const candidates: any[] = [];
    for (const candidatePath of config.strategy.shadowCandidatePaths || []) {
      try {
        const strategy = await registry.loadFromFile(candidatePath);
        const summary = memoryManager.summarizeEpisodesByStrategy(
          strategy.metadata.id,
          strategy.metadata.version,
          { sinceMs, limit: 1000 }
        );
        candidates.push({
          path: candidatePath,
          id: strategy.metadata.id,
          version: strategy.metadata.version,
          summary,
        });
      } catch (error: any) {
        candidates.push({
          path: candidatePath,
          error: error?.message || String(error),
        });
      }
    }

    return c.json({
      enabled: config.strategy.shadowModeEnabled,
      trafficRatio: config.strategy.shadowTrafficRatio,
      autoPromoteEnabled: config.strategy.autoPromoteEnabled,
      windowDays,
      baseline: {
        path: config.strategy.activePath || null,
        id: baseline.metadata.id,
        version: baseline.metadata.version,
        summary: baselineSummary,
      },
      candidates,
    });
  });

  app.post('/api/strategy/proposals/:id/reject', async (c) => {
    const id = Number(c.req.param('id'));
    let reason = '';
    try {
      const body = await c.req.json();
      reason = body?.reason || '';
    } catch { }

    try {
      await approvalService.rejectProposal(id, reason);
      return c.json({ ok: true });
    } catch (error: any) {
      const message = error?.message || 'Rejection failed';
      if (message === 'Proposal not found') return c.json({ error: message }, 404);
      return c.json({ error: message }, 400);
    }
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
