import * as path from 'node:path';
import * as os from 'node:os';
import type { LydiaConfig } from '../config/index.js';
import type { McpClientManager } from '../mcp/index.js';

export type RiskLevel = 'low' | 'high';

export interface RiskAssessment {
  level: RiskLevel;
  reason?: string;
  signature?: string;
  details?: string;
}

const DEFAULT_USER_DATA_DIRS = [
  '~/.lydia',
  '~/Desktop',
  '~/Documents',
  '~/Downloads',
];

const DEFAULT_SYSTEM_DIRS_WINDOWS = [
  'C:\\Windows',
  'C:\\Program Files',
  'C:\\Program Files (x86)',
  'C:\\ProgramData',
];

function expandHome(p: string): string {
  if (p.startsWith('~/') || p === '~') {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

function normalizePath(p: string): string {
  const expanded = expandHome(p);
  const normalized = path.resolve(expanded);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function buildProtectedDirs(config?: LydiaConfig): { userDataDirs: string[]; systemDirs: string[]; allowPaths: string[]; denyPaths: string[] } {
  const userDataDirs = (config?.safety?.userDataDirs?.length ? config.safety.userDataDirs : DEFAULT_USER_DATA_DIRS)
    .map(normalizePath);

  const systemDirsRaw = config?.safety?.systemDirs?.length
    ? config.safety.systemDirs
    : (process.platform === 'win32' ? DEFAULT_SYSTEM_DIRS_WINDOWS : []);

  const systemDirs = systemDirsRaw.map(normalizePath);

  const allowPaths = (config?.safety?.allowPaths || []).map(normalizePath);
  const denyPaths = (config?.safety?.denyPaths || []).map(normalizePath);

  return { userDataDirs, systemDirs, allowPaths, denyPaths };
}

function isInProtectedDir(targetPath: string, protectedDirs: string[]): boolean {
  const normalizedTarget = normalizePath(targetPath);
  return protectedDirs.some(dir => normalizedTarget === dir || normalizedTarget.startsWith(dir + path.sep));
}

function extractPathsFromCommand(command: string): string[] {
  const paths: string[] = [];
  const winPathRegex = /[A-Za-z]:\\[^\s'"]+/g;
  const unixPathRegex = /\/[^\s'"]+/g;

  const winMatches = command.match(winPathRegex) || [];
  const unixMatches = command.match(unixPathRegex) || [];

  return paths.concat(winMatches, unixMatches);
}

function isDestructiveShellCommand(command: string): boolean {
  const cmd = command.toLowerCase();
  return (
    /\b(del|erase|rd|rmdir|rm|remove-item)\b/.test(cmd) ||
    /\b(move|mv|ren|rename)\b/.test(cmd) ||
    /(\s|^)>/.test(cmd)
  );
}

function isPermissionChangeCommand(command: string): boolean {
  const cmd = command.toLowerCase();
  return (
    /\b(chmod|chown|chgrp)\b/.test(cmd) ||
    /\b(icacls|takeown)\b/.test(cmd)
  );
}

function hasRelativePathTraversal(input: string): boolean {
  return /(^|[\\\/])\.\.([\\\/]|$)/.test(input);
}

function isRelativePath(input: string): boolean {
  return !path.isAbsolute(input);
}

export function assessRisk(
  toolName: string,
  args: Record<string, unknown> | undefined,
  mcp: McpClientManager,
  config?: LydiaConfig
): RiskAssessment {
  const protectedDirs = buildProtectedDirs(config);

  if (mcp.isToolExternal(toolName)) {
    return {
      level: 'high',
      reason: 'External MCP tool call',
      signature: `external_mcp:${toolName}`,
      details: toolName,
    };
  }

  if (toolName === 'fs_write_file') {
    const targetPath = typeof args?.path === 'string' ? args.path : '';
    if (targetPath) {
      if (isRelativePath(targetPath) && hasRelativePathTraversal(targetPath)) {
        return {
          level: 'high',
          reason: 'File write with relative path traversal',
          signature: `fs_write_rel:${normalizePath(path.resolve(targetPath))}`,
          details: targetPath,
        };
      }
      if (isInProtectedDir(targetPath, protectedDirs.denyPaths)) {
        return {
          level: 'high',
          reason: 'File write in denylisted path',
          signature: `fs_write_deny:${normalizePath(targetPath)}`,
          details: targetPath,
        };
      }
      if (isInProtectedDir(targetPath, protectedDirs.allowPaths)) {
        return { level: 'low' };
      }
      const inUser = isInProtectedDir(targetPath, protectedDirs.userDataDirs);
      const inSystem = isInProtectedDir(targetPath, protectedDirs.systemDirs);
      if (inUser || inSystem) {
        const scope = inSystem ? 'system_dir' : 'user_data_dir';
        return {
          level: 'high',
          reason: `File write in protected ${scope}`,
          signature: `fs_write:${normalizePath(targetPath)}`,
          details: targetPath,
        };
      }
    }
  }

  if (toolName === 'shell_execute') {
    const command = typeof args?.command === 'string' ? args.command : '';
    if (command && (isDestructiveShellCommand(command) || isPermissionChangeCommand(command))) {
      const targets = extractPathsFromCommand(command);
      const hasTraversal = hasRelativePathTraversal(command);
      if (targets.length === 0 || hasTraversal) {
        return {
          level: 'high',
          reason: 'Destructive shell command with unknown or relative target',
          signature: `shell_unknown:${command.toLowerCase().slice(0, 80)}`,
          details: command,
        };
      }
      const denyHit = targets.find(p => isInProtectedDir(p, protectedDirs.denyPaths));
      if (denyHit) {
        return {
          level: 'high',
          reason: 'Destructive shell command in denylisted path',
          signature: `shell_deny:${normalizePath(denyHit)}`,
          details: command,
        };
      }

      const allowHit = targets.find(p => isInProtectedDir(p, protectedDirs.allowPaths));
      if (allowHit) {
        return { level: 'low' };
      }

      const hit = targets.find(p =>
        isInProtectedDir(p, protectedDirs.userDataDirs) || isInProtectedDir(p, protectedDirs.systemDirs)
      );

      if (hit) {
        const inSystem = isInProtectedDir(hit, protectedDirs.systemDirs);
        const scope = inSystem ? 'system_dir' : 'user_data_dir';
        return {
          level: 'high',
          reason: `Destructive shell command in protected ${scope}`,
          signature: `shell_destructive:${normalizePath(hit)}`,
          details: command,
        };
      }
    }
  }

  return { level: 'low' };
}
