/**
 * CLI client for communicating with the Lydia server.
 *
 * The server is the single execution layer. The CLI is just a presentation
 * layer that talks to the server via HTTP + WebSocket.
 */
import chalk from 'chalk';
import { createServer } from './server/index.js';
import WebSocket from 'ws';

const DEFAULT_PORT = 3000;
const MAX_RETRIES = 20;
const RETRY_DELAY_MS = 300;

let serverStarted = false;

/** Get the base URL for the server */
export function getServerUrl(port?: number): string {
  return `http://localhost:${port || DEFAULT_PORT}`;
}

/** Get the WebSocket URL for the server */
export function getWsUrl(port?: number): string {
  return `ws://localhost:${port || DEFAULT_PORT}/ws`;
}

/** Check if the server is reachable */
export async function isServerRunning(port?: number): Promise<boolean> {
  try {
    const res = await fetch(`${getServerUrl(port)}/api/status`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Ensure the server is running. If not, start it in the background.
 * Returns the port the server is running on.
 */
export async function ensureServer(port?: number): Promise<number> {
  const p = port || DEFAULT_PORT;

  if (await isServerRunning(p)) {
    return p;
  }

  if (serverStarted) {
    // Already tried to start, wait a bit more
    await waitForServer(p);
    return p;
  }

  // Start server in-process (non-blocking, silent output)
  serverStarted = true;
  const server = createServer(p, { silent: true });
  server.start();

  // Wait until server is ready
  await waitForServer(p);
  return p;
}

async function waitForServer(port: number): Promise<void> {
  for (let i = 0; i < MAX_RETRIES; i++) {
    if (await isServerRunning(port)) return;
    await sleep(RETRY_DELAY_MS);
  }
  throw new Error(`Server failed to start on port ${port} after ${MAX_RETRIES * RETRY_DELAY_MS}ms`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── HTTP API Helpers ───────────────────────────────────────────────

export async function apiGet<T = any>(path: string, port?: number): Promise<T> {
  const res = await fetch(`${getServerUrl(port)}${path}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || `GET ${path} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function apiPost<T = any>(path: string, body?: any, port?: number): Promise<T> {
  const res = await fetch(`${getServerUrl(port)}${path}`, {
    method: 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || `POST ${path} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ─── WebSocket Streaming ────────────────────────────────────────────

export interface WsEventHandler {
  onText?: (text: string) => void;
  onThinking?: (thinking: string) => void;
  onToolStart?: (name: string) => void;
  onToolComplete?: (name: string, duration: number, result?: string) => void;
  onToolError?: (name: string, error: string) => void;
  onRetry?: (attempt: number, maxRetries: number, delay: number, error: string) => void;
  onInteraction?: (id: string, prompt: string) => Promise<string>;
  onComplete?: (taskId: string, result: string) => void;
  onError?: (error: string) => void;
  onMessage?: (type: string, data: any) => void;
}

/**
 * Connect to the server WebSocket and stream task events.
 * Returns a cleanup function to close the connection.
 */
export function connectTaskStream(
  runId: string,
  handlers: WsEventHandler,
  port?: number,
): Promise<{ close: () => void }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(getWsUrl(port));
    let resolved = false;

    ws.on('open', () => {
      resolved = true;
      resolve({ close: () => ws.close() });
    });

    ws.on('error', (err) => {
      if (!resolved) {
        reject(err);
      }
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        // Only process events for our run
        if (msg.data?.runId && msg.data.runId !== runId) return;

        switch (msg.type) {
          case 'stream:text':
            handlers.onText?.(msg.data?.text || '');
            break;
          case 'stream:thinking':
            handlers.onThinking?.(msg.data?.thinking || '');
            break;
          case 'tool:start':
            handlers.onToolStart?.(msg.data?.name || 'unknown');
            break;
          case 'tool:complete':
            handlers.onToolComplete?.(msg.data?.name || 'unknown', msg.data?.duration || 0, msg.data?.result);
            break;
          case 'tool:error':
            handlers.onToolError?.(msg.data?.name || 'unknown', msg.data?.error || 'unknown error');
            break;
          case 'retry':
            handlers.onRetry?.(msg.data?.attempt, msg.data?.maxRetries, msg.data?.delay, msg.data?.error);
            break;
          case 'interaction_request':
            if (handlers.onInteraction) {
              handlers.onInteraction(msg.data?.id, msg.data?.prompt).then((response) => {
                apiPost(`/api/tasks/${runId}/respond`, { response }, port).catch(() => {});
              });
            }
            break;
          case 'task:complete':
            handlers.onComplete?.(msg.data?.taskId || '', msg.data?.result || '');
            ws.close();
            break;
          case 'task:error':
            handlers.onError?.(msg.data?.error || 'Task failed.');
            ws.close();
            break;
          default:
            handlers.onMessage?.(msg.type, msg.data);
            break;
        }
      } catch {
        // ignore parse errors
      }
    });
  });
}
