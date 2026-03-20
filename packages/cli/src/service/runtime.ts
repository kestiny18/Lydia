import { ConfigLoader, StrategyRegistry } from '@lydia-agent/core';
import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { DEFAULT_HOST, DEFAULT_PORT } from './constants.js';

export interface LydiaPaths {
  home: string;
  baseDir: string;
  configPath: string;
  dataDir: string;
  logsDir: string;
  runDir: string;
  skillsDir: string;
  strategiesDir: string;
  strategyPath: string;
  serverPidPath: string;
  serverStatePath: string;
  serverLogPath: string;
  serverErrorLogPath: string;
}

export interface InitWorkspaceResult {
  paths: LydiaPaths;
  created: string[];
  existing: string[];
}

export interface ServiceState {
  pid: number;
  port: number;
  host: string;
  baseUrl: string;
  startedAt: string;
  version: string;
}

export function getLydiaPaths(home: string = os.homedir()): LydiaPaths {
  const baseDir = path.join(home, '.lydia');
  const strategiesDir = path.join(baseDir, 'strategies');
  const skillsDir = path.join(baseDir, 'skills');
  const dataDir = path.join(baseDir, 'data');
  const logsDir = path.join(baseDir, 'logs');
  const runDir = path.join(baseDir, 'run');
  return {
    home,
    baseDir,
    configPath: path.join(baseDir, 'config.json'),
    dataDir,
    logsDir,
    runDir,
    skillsDir,
    strategiesDir,
    strategyPath: path.join(strategiesDir, 'default.yml'),
    serverPidPath: path.join(runDir, 'server.pid'),
    serverStatePath: path.join(runDir, 'server.json'),
    serverLogPath: path.join(logsDir, 'server.log'),
    serverErrorLogPath: path.join(logsDir, 'server-error.log'),
  };
}

export function getBaseUrl(port: number = DEFAULT_PORT, host: string = DEFAULT_HOST): string {
  return `http://${host}:${port}`;
}

export async function initLocalWorkspace(): Promise<InitWorkspaceResult> {
  const paths = getLydiaPaths();
  const created: string[] = [];
  const existing: string[] = [];
  const dirs = [
    paths.baseDir,
    paths.strategiesDir,
    paths.skillsDir,
    paths.dataDir,
    paths.logsDir,
    paths.runDir,
  ];

  for (const dir of dirs) {
    if (fs.existsSync(dir)) {
      existing.push(dir);
      continue;
    }
    await fsPromises.mkdir(dir, { recursive: true });
    created.push(dir);
  }

  const loader = new ConfigLoader();
  if (!fs.existsSync(paths.configPath)) {
    const config = await loader.load();
    await fsPromises.writeFile(paths.configPath, JSON.stringify(config, null, 2), 'utf-8');
    created.push(paths.configPath);
  } else {
    existing.push(paths.configPath);
  }

  if (!fs.existsSync(paths.strategyPath)) {
    const registry = new StrategyRegistry();
    const strategy = await registry.loadDefault();
    const initial = {
      ...strategy,
      metadata: {
        ...strategy.metadata,
        id: 'default',
        version: '1.0.0',
        name: 'Default Strategy',
        description: 'Baseline strategy for safe execution.',
      },
    };
    await registry.saveToFile(initial, paths.strategyPath);
    created.push(paths.strategyPath);
  } else {
    existing.push(paths.strategyPath);
  }

  const config = await loader.load();
  if (!config.strategy.activePath) {
    await loader.update({
      strategy: {
        activePath: paths.strategyPath,
      },
    } as any);
  }

  return { paths, created, existing };
}

export async function readServiceState(): Promise<ServiceState | null> {
  const { serverStatePath } = getLydiaPaths();
  try {
    const raw = await fsPromises.readFile(serverStatePath, 'utf-8');
    return JSON.parse(raw) as ServiceState;
  } catch {
    return null;
  }
}

export async function writeServiceState(state: ServiceState): Promise<void> {
  const { serverStatePath, serverPidPath } = getLydiaPaths();
  await fsPromises.mkdir(path.dirname(serverStatePath), { recursive: true });
  await fsPromises.writeFile(serverStatePath, JSON.stringify(state, null, 2), 'utf-8');
  await fsPromises.writeFile(serverPidPath, `${state.pid}\n`, 'utf-8');
}

export async function removeServiceState(): Promise<void> {
  const { serverStatePath, serverPidPath } = getLydiaPaths();
  await Promise.all([
    fsPromises.rm(serverStatePath, { force: true }),
    fsPromises.rm(serverPidPath, { force: true }),
  ]);
}
