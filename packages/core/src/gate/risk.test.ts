import { describe, it, expect } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { assessRisk } from './risk.js';

class MockMcpClientManager {
  isToolExternal(name: string) {
    return name.startsWith('ext-');
  }
}

describe('Risk Assessment', () => {
  const mcp = new MockMcpClientManager() as any;

  it('flags external MCP tools as high risk', () => {
    const risk = assessRisk('ext-tool', {}, mcp, {
      mcpServers: {},
      safety: { userDataDirs: [], systemDirs: [], rememberApprovals: true },
    } as any);
    expect(risk.level).toBe('high');
    expect(risk.reason).toContain('External MCP');
  });

  it('flags protected user data writes as high risk', () => {
    const userDir = path.join(os.tmpdir(), 'lydia-risk-user');
    const target = path.join(userDir, 'file.txt');

    const risk = assessRisk('fs_write_file', { path: target }, mcp, {
      mcpServers: {},
      safety: { userDataDirs: [userDir], systemDirs: [], allowPaths: [], denyPaths: [], rememberApprovals: true },
    } as any);

    expect(risk.level).toBe('high');
    expect(risk.reason).toContain('File write');
  });

  it('allows non-protected writes as low risk', () => {
    const safeDir = path.join(os.tmpdir(), 'lydia-risk-safe');
    const target = path.join(safeDir, 'file.txt');

    const risk = assessRisk('fs_write_file', { path: target }, mcp, {
      mcpServers: {},
      safety: { userDataDirs: [], systemDirs: [], allowPaths: [], denyPaths: [], rememberApprovals: true },
    } as any);

    expect(risk.level).toBe('low');
  });

  it('flags destructive shell commands in protected paths', () => {
    const userDir = path.join(os.tmpdir(), 'lydia-risk-shell');
    const target = path.join(userDir, 'file.txt');
    const command = process.platform === 'win32'
      ? `del ${target}`
      : `rm ${target}`;

    const risk = assessRisk('shell_execute', { command }, mcp, {
      mcpServers: {},
      safety: { userDataDirs: [userDir], systemDirs: [], allowPaths: [], denyPaths: [], rememberApprovals: true },
    } as any);

    expect(risk.level).toBe('high');
    expect(risk.reason).toContain('Destructive shell');
  });

  it('denylists override allowlists for file writes', () => {
    const baseDir = path.join(os.tmpdir(), 'lydia-risk-override');
    const target = path.join(baseDir, 'file.txt');

    const risk = assessRisk('fs_write_file', { path: target }, mcp, {
      mcpServers: {},
      safety: {
        userDataDirs: [],
        systemDirs: [],
        allowPaths: [baseDir],
        denyPaths: [baseDir],
        rememberApprovals: true,
      },
    } as any);

    expect(risk.level).toBe('high');
    expect(risk.reason).toContain('denylisted');
  });
});
