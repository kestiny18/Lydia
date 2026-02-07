import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { MemoryManager } from '@lydia/core';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createServer(port: number = 3000) {
  const app = new Hono();

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
      } catch {}
      try {
        output = JSON.parse(t.tool_output);
      } catch {}
      return {
        ...t,
        args,
        output,
      };
    });
    return c.json({ episode, traces: traceDetails, summary });
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
