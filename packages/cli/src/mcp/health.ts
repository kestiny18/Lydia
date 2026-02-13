import { McpClientManager } from '@lydia/core';

export interface McpCheckTarget {
  id: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface McpCheckOptions {
  timeoutMs?: number;
  retries?: number;
}

export interface McpCheckResult {
  id: string;
  ok: boolean;
  tools: string[];
  durationMs: number;
  attempts: number;
  error?: string;
}

function timeoutError(timeoutMs: number): Error {
  return new Error(`Timeout after ${timeoutMs}ms`);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(timeoutError(timeoutMs)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function checkMcpServer(
  target: McpCheckTarget,
  options: McpCheckOptions = {}
): Promise<McpCheckResult> {
  const timeoutMs = options.timeoutMs ?? 15000;
  const retries = Math.max(0, options.retries ?? 0);

  const start = Date.now();
  let attempts = 0;
  let lastError: unknown = null;

  while (attempts <= retries) {
    attempts += 1;
    const manager = new McpClientManager();
    try {
      await withTimeout(
        manager.connect({
          id: target.id,
          type: 'stdio',
          command: target.command,
          args: target.args || [],
          env: target.env,
        }),
        timeoutMs
      );

      const tools = manager.getTools().map((t) => t.name);
      return {
        id: target.id,
        ok: true,
        tools,
        durationMs: Date.now() - start,
        attempts,
      };
    } catch (error) {
      lastError = error;
    } finally {
      await manager.closeAll().catch(() => {});
    }
  }

  return {
    id: target.id,
    ok: false,
    tools: [],
    durationMs: Date.now() - start,
    attempts,
    error: lastError instanceof Error ? lastError.message : String(lastError),
  };
}

export async function checkMcpServers(
  targets: McpCheckTarget[],
  options: McpCheckOptions = {}
): Promise<McpCheckResult[]> {
  const results: McpCheckResult[] = [];
  for (const target of targets) {
    results.push(await checkMcpServer(target, options));
  }
  return results;
}

