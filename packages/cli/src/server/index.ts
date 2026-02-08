import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { MemoryManager, ConfigLoader, Agent, AnthropicProvider, OpenAIProvider, OllamaProvider, MockProvider, FallbackProvider } from '@lydia/core';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createServer(port: number = 3000) {
  const app = new Hono();
  let isRunning = false;

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

  app.post('/api/tasks/run', async (c) => {
    if (isRunning) {
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

    const config = await new ConfigLoader().load();
    const providerChoice = config.llm?.provider || 'auto';
    const fallbackOrder = Array.isArray(config.llm?.fallbackOrder) && config.llm?.fallbackOrder.length > 0
      ? config.llm.fallbackOrder
      : ['ollama', 'openai', 'anthropic'];

    const createProvider = (name: string, strict: boolean) => {
      if (name === 'mock') return new MockProvider();
      if (name === 'ollama') {
        return new OllamaProvider({ defaultModel: config.llm?.defaultModel || undefined });
      }
      if (name === 'openai') {
        if (!process.env.OPENAI_API_KEY) {
          if (strict) throw new Error('OPENAI_API_KEY is not set.');
          return null;
        }
        return new OpenAIProvider({ defaultModel: config.llm?.defaultModel || undefined });
      }
      if (name === 'anthropic') {
        if (!process.env.ANTHROPIC_API_KEY) {
          if (strict) throw new Error('ANTHROPIC_API_KEY is not set.');
          return null;
        }
        return new AnthropicProvider({ defaultModel: config.llm?.defaultModel || undefined });
      }
      if (strict) throw new Error(`Unknown provider ${name}.`);
      return null;
    };

    let llm: any;
    try {
      if (providerChoice === 'auto') {
        const providers = fallbackOrder.map((name) => createProvider(name, false)).filter(Boolean);
        if (providers.length === 0) {
          return c.json({ error: 'No available providers configured.' }, 500);
        }
        llm = providers.length === 1 ? providers[0] : new FallbackProvider(providers as any);
      } else {
        llm = createProvider(providerChoice, true);
      }
    } catch (error: any) {
      return c.json({ error: error.message || 'Failed to initialize provider.' }, 500);
    }

    isRunning = true;
    let warning: string | undefined;
    try {
      const agent = new Agent(llm);
      let hadInteraction = false;
      agent.on('interaction_request', (req) => {
        hadInteraction = true;
        agent.resolveInteraction(req.id, 'no');
      });
      const task = await agent.run(inputText);
      if (hadInteraction) {
        warning = 'Task required confirmation and was auto-denied in web UI.';
      }
      return c.json({ task, warning });
    } catch (error: any) {
      return c.json({ error: error.message || 'Task failed.' }, 500);
    } finally {
      isRunning = false;
    }
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
      console.log(`Starting server on port ${port}...`);
      serve({
        fetch: app.fetch,
        port
      });
    }
  };
}
