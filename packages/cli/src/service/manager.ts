import * as fs from 'node:fs';
import { spawn } from 'node:child_process';
import { DEFAULT_HOST, DEFAULT_PORT, STATUS_POLL_INTERVAL_MS, STATUS_POLL_TIMEOUT_MS } from './constants.js';
import {
  getBaseUrl,
  getLydiaPaths,
  initLocalWorkspace,
  readServiceState,
  removeServiceState,
  type ServiceState,
  writeServiceState,
} from './runtime.js';

export interface ServiceStatus {
  running: boolean;
  healthy: boolean;
  pid: number | null;
  port: number;
  host: string;
  baseUrl: string;
  startedAt?: string;
  version?: string;
  reason?: string;
}

export function isPidRunning(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

interface ServiceHealthPayload {
  status?: string;
  pid?: number;
  version?: string;
  startedAt?: string;
  baseUrl?: string;
  host?: string;
  port?: number;
}

async function fetchServiceHealth(port: number = DEFAULT_PORT, host: string = DEFAULT_HOST): Promise<ServiceHealthPayload | null> {
  try {
    const res = await fetch(`${getBaseUrl(port, host)}/api/status`, {
      signal: AbortSignal.timeout(2_000),
    });
    if (!res.ok) return null;
    const payload = await res.json() as ServiceHealthPayload;
    if (payload?.status !== 'ok') return null;
    return payload;
  } catch {
    return null;
  }
}

export async function isServerHealthy(port: number = DEFAULT_PORT, host: string = DEFAULT_HOST): Promise<boolean> {
  return Boolean(await fetchServiceHealth(port, host));
}

export async function waitForServer(port: number = DEFAULT_PORT, host: string = DEFAULT_HOST): Promise<void> {
  const deadline = Date.now() + STATUS_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await isServerHealthy(port, host)) return;
    await sleep(STATUS_POLL_INTERVAL_MS);
  }
  throw new Error(`Server failed to become healthy on ${host}:${port} within ${STATUS_POLL_TIMEOUT_MS}ms`);
}

export async function getServiceStatus(): Promise<ServiceStatus> {
  const state = await readServiceState();
  const host = state?.host || DEFAULT_HOST;
  const port = state?.port || DEFAULT_PORT;
  const baseUrl = getBaseUrl(port, host);
  const health = await fetchServiceHealth(port, host);

  if (!state) {
    const healthy = Boolean(health);
    return {
      running: healthy,
      healthy,
      pid: typeof health?.pid === 'number' ? health.pid : null,
      port,
      host,
      baseUrl,
      startedAt: health?.startedAt,
      version: health?.version,
      reason: healthy ? 'Healthy service detected without local state file.' : 'Service is not running.',
    };
  }

  const pidRunning = isPidRunning(state.pid);
  const healthy = Boolean(health);
  if (!pidRunning && !healthy) {
    await removeServiceState();
    return {
      running: false,
      healthy: false,
      pid: state.pid,
      port: state.port,
      host: state.host,
      baseUrl: state.baseUrl,
      startedAt: state.startedAt,
      version: state.version,
      reason: 'Found stale Lydia state; cleaned it up.',
    };
  }

  return {
    running: pidRunning || healthy,
    healthy,
    pid: typeof health?.pid === 'number' ? health.pid : state.pid,
    port: state.port,
    host: state.host,
    baseUrl: state.baseUrl,
    startedAt: health?.startedAt || state.startedAt,
    version: health?.version || state.version,
    reason: healthy ? 'Service is healthy.' : 'Process exists but health endpoint is not responding yet.',
  };
}

export async function ensureServiceStarted(port: number = DEFAULT_PORT, host: string = DEFAULT_HOST): Promise<ServiceStatus> {
  const status = await getServiceStatus();
  if (status.running && status.healthy) {
    return status;
  }
  return startService({ port, host });
}

export async function startService(options: { port?: number; host?: string; version?: string } = {}): Promise<ServiceStatus> {
  const port = options.port || DEFAULT_PORT;
  const host = options.host || DEFAULT_HOST;
  const version = options.version || 'unknown';
  const status = await getServiceStatus();
  if (status.running && status.healthy) {
    return status;
  }

  await initLocalWorkspace();
  const paths = getLydiaPaths();
  const launch = resolveLaunchCommand(port, host);
  const outFd = fs.openSync(paths.serverLogPath, 'a');
  const errFd = fs.openSync(paths.serverErrorLogPath, 'a');

  const child = spawn(launch.command, launch.args, {
    cwd: process.cwd(),
    detached: true,
    stdio: ['ignore', outFd, errFd],
    windowsHide: true,
  });
  fs.closeSync(outFd);
  fs.closeSync(errFd);

  child.unref();

  try {
    await waitForServer(port, host);
    const nextState: ServiceState = {
      pid: child.pid ?? 0,
      port,
      host,
      baseUrl: getBaseUrl(port, host),
      startedAt: new Date().toISOString(),
      version,
    };
    await writeServiceState(nextState);
    return {
      running: true,
      healthy: true,
      pid: nextState.pid,
      port,
      host,
      baseUrl: nextState.baseUrl,
      startedAt: nextState.startedAt,
      version,
      reason: 'Service started successfully.',
    };
  } catch (error) {
    try {
      if (child.pid) process.kill(child.pid);
    } catch {}
    throw error;
  }
}

export async function stopService(): Promise<ServiceStatus> {
  const state = await readServiceState();
  const health = await fetchServiceHealth(
    state?.port || DEFAULT_PORT,
    state?.host || DEFAULT_HOST,
  );

  const pid = state?.pid || (typeof health?.pid === 'number' ? health.pid : 0);
  if (!state && !pid) {
    return {
      running: false,
      healthy: false,
      pid: null,
      port: DEFAULT_PORT,
      host: DEFAULT_HOST,
      baseUrl: getBaseUrl(),
      reason: 'Service is not running.',
    };
  }

  if (pid && isPidRunning(pid)) {
    await terminateProcess(pid);
  }

  const deadline = Date.now() + STATUS_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (!pid || !isPidRunning(pid)) break;
    await sleep(STATUS_POLL_INTERVAL_MS);
  }

  await removeServiceState();

  return {
    running: false,
    healthy: false,
    pid: pid || null,
    port: state?.port || health?.port || DEFAULT_PORT,
    host: state?.host || health?.host || DEFAULT_HOST,
    baseUrl: state?.baseUrl || health?.baseUrl || getBaseUrl(),
    startedAt: state?.startedAt || health?.startedAt,
    version: state?.version || health?.version,
    reason: 'Service stopped.',
  };
}

async function terminateProcess(pid: number): Promise<void> {
  try {
    if (process.platform === 'win32') {
      await spawnAndWait('taskkill', ['/PID', String(pid), '/T', '/F']);
      return;
    }
    process.kill(pid, 'SIGTERM');
  } catch {}
}

async function spawnAndWait(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'ignore',
      windowsHide: true,
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0 || code === 128 || code === 255) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with code ${code}`));
    });
  }).catch(() => {});
}

function resolveLaunchCommand(port: number, host: string): { command: string; args: string[] } {
  const entry = process.argv[1];
  if (!entry) {
    throw new Error('Unable to resolve Lydia CLI entry point.');
  }

  if (entry.endsWith('.ts')) {
    const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
    return {
      command: pnpmCommand,
      args: ['tsx', entry, 'serve', '--port', String(port), '--host', host],
    };
  }

  return {
    command: process.execPath,
    args: [entry, 'serve', '--port', String(port), '--host', host],
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
