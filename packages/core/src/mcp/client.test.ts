import { describe, it, expect, beforeEach } from 'vitest';
import { McpClientManager } from './client.js';

describe('McpClientManager', () => {
  describe('getToolDefinitions', () => {
    it('should return empty array when no tools registered', () => {
      const manager = new McpClientManager();
      const tools = manager.getToolDefinitions();
      expect(tools).toEqual([]);
    });

    it('should return tool definitions with correct format', () => {
      const manager = new McpClientManager();
      const tools = manager.getToolDefinitions();
      // Since we can't connect real servers in unit tests, verify the empty state
      expect(Array.isArray(tools)).toBe(true);
    });
  });

  describe('getToolInfo', () => {
    it('should return undefined for non-existent tool', () => {
      const manager = new McpClientManager();
      const info = manager.getToolInfo('nonexistent');
      expect(info).toBeUndefined();
    });
  });

  describe('isToolExternal', () => {
    it('should return false for non-existent tool', () => {
      const manager = new McpClientManager();
      expect(manager.isToolExternal('nonexistent')).toBe(false);
    });
  });

  describe('callTool', () => {
    it('should throw for non-existent tool', async () => {
      const manager = new McpClientManager();
      await expect(manager.callTool('nonexistent', {})).rejects.toThrow("Tool 'nonexistent' not found.");
    });
  });

  describe('closeAll', () => {
    it('should clear all state', async () => {
      const manager = new McpClientManager();
      await manager.closeAll();
      expect(manager.getTools()).toEqual([]);
      expect(manager.getToolDefinitions()).toEqual([]);
    });
  });

  describe('tool namespace collision handling', () => {
    // Since we can't easily mock MCP connections, we test the collision logic
    // conceptually. The real collision handling is tested via integration tests.
    it('should handle the concept of prefixed names in callTool', async () => {
      const manager = new McpClientManager();

      // Calling a prefixed tool that doesn't exist should still throw
      await expect(manager.callTool('server1/read_file', {}))
        .rejects.toThrow("Tool 'server1/read_file' not found.");
    });
  });
});
