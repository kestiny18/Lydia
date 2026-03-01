import { describe, expect, it } from 'vitest';
import {
  listCanonicalComputerUseActions,
  resolveCanonicalComputerUseToolName,
  isCanonicalComputerUseTool
} from './contract.js';

describe('computer-use canonical contract', () => {
  it('resolves browser aliases to canonical tool names', () => {
    expect(resolveCanonicalComputerUseToolName('browser.navigate')).toBe('browser_navigate');
    expect(resolveCanonicalComputerUseToolName('playwright_fill')).toBe('browser_type');
  });

  it('resolves desktop aliases to canonical tool names', () => {
    expect(resolveCanonicalComputerUseToolName('computer_screenshot')).toBe('desktop_capture');
    expect(resolveCanonicalComputerUseToolName('desktop_hotkey')).toBe('desktop_key_press');
  });

  it('identifies canonical names accurately', () => {
    expect(isCanonicalComputerUseTool('browser_navigate')).toBe(true);
    expect(isCanonicalComputerUseTool('browser.navigate')).toBe(false);
    expect(isCanonicalComputerUseTool('unknown_tool')).toBe(false);
  });

  it('contains both browser and desktop baseline actions', () => {
    const actions = listCanonicalComputerUseActions();
    const browser = actions.filter((a) => a.domain === 'browser');
    const desktop = actions.filter((a) => a.domain === 'desktop');
    expect(browser.length).toBeGreaterThanOrEqual(10);
    expect(desktop.length).toBeGreaterThanOrEqual(10);
  });
});

