export type ComputerUseDomain = 'browser' | 'desktop';

export interface CanonicalComputerUseAction {
  domain: ComputerUseDomain;
  toolName: string;
  requiredArgs: string[];
  description: string;
  aliases: string[];
}

const BROWSER_ACTIONS: CanonicalComputerUseAction[] = [
  { domain: 'browser', toolName: 'browser_navigate', requiredArgs: ['url'], description: 'Navigate to a URL', aliases: ['browser.navigate', 'browser_goto', 'browser_open', 'playwright_navigate'] },
  { domain: 'browser', toolName: 'browser_click', requiredArgs: ['selector'], description: 'Click an element', aliases: ['browser.click', 'playwright_click'] },
  { domain: 'browser', toolName: 'browser_type', requiredArgs: ['selector', 'text'], description: 'Type text into an input', aliases: ['browser.type', 'browser_fill', 'playwright_type', 'playwright_fill'] },
  { domain: 'browser', toolName: 'browser_select', requiredArgs: ['selector', 'value'], description: 'Select option(s) in a select input', aliases: ['browser.select', 'browser_select_option', 'playwright_select'] },
  { domain: 'browser', toolName: 'browser_wait_for', requiredArgs: ['selector'], description: 'Wait for condition/selector', aliases: ['browser.wait_for', 'browser_wait', 'playwright_wait_for_selector'] },
  { domain: 'browser', toolName: 'browser_extract_text', requiredArgs: ['selector'], description: 'Extract visible text', aliases: ['browser_get_text', 'browser_extract', 'playwright_text_content'] },
  { domain: 'browser', toolName: 'browser_screenshot', requiredArgs: [], description: 'Capture page screenshot', aliases: ['browser.screenshot', 'playwright_screenshot'] },
  { domain: 'browser', toolName: 'browser_download', requiredArgs: [], description: 'Download an artifact', aliases: ['browser_download_file'] },
  { domain: 'browser', toolName: 'browser_upload', requiredArgs: ['selector', 'path'], description: 'Upload a local file', aliases: ['browser_upload_file', 'browser_attach_file'] },
  { domain: 'browser', toolName: 'browser_close', requiredArgs: [], description: 'Close browser/page context', aliases: ['browser.close', 'playwright_close'] },
];

const DESKTOP_ACTIONS: CanonicalComputerUseAction[] = [
  { domain: 'desktop', toolName: 'desktop_capture', requiredArgs: [], description: 'Capture current desktop frame', aliases: ['desktop_screenshot', 'computer_screenshot', 'screen_capture', 'computer.capture'] },
  { domain: 'desktop', toolName: 'desktop_click', requiredArgs: ['x', 'y'], description: 'Left-click at coordinate', aliases: ['computer_click', 'desktop_tap'] },
  { domain: 'desktop', toolName: 'desktop_double_click', requiredArgs: ['x', 'y'], description: 'Double-click at coordinate', aliases: ['computer_double_click'] },
  { domain: 'desktop', toolName: 'desktop_right_click', requiredArgs: ['x', 'y'], description: 'Right-click at coordinate', aliases: ['computer_right_click', 'desktop_context_click'] },
  { domain: 'desktop', toolName: 'desktop_move_mouse', requiredArgs: ['x', 'y'], description: 'Move cursor to coordinate', aliases: ['computer_move_mouse', 'desktop_move_cursor'] },
  { domain: 'desktop', toolName: 'desktop_drag', requiredArgs: ['fromX', 'fromY', 'toX', 'toY'], description: 'Drag from source to target coordinate', aliases: ['computer_drag', 'desktop_drag_mouse'] },
  { domain: 'desktop', toolName: 'desktop_type', requiredArgs: ['text'], description: 'Type text via keyboard', aliases: ['computer_type', 'desktop_input_text'] },
  { domain: 'desktop', toolName: 'desktop_key_press', requiredArgs: ['key'], description: 'Press key or key chord', aliases: ['computer_key_press', 'computer_key', 'desktop_hotkey'] },
  { domain: 'desktop', toolName: 'desktop_scroll', requiredArgs: ['deltaY'], description: 'Scroll pointer context', aliases: ['computer_scroll', 'desktop_mouse_wheel'] },
  { domain: 'desktop', toolName: 'desktop_wait_for', requiredArgs: [], description: 'Wait for desktop condition', aliases: ['computer_wait', 'desktop_wait'] },
];

const ALL_ACTIONS = [...BROWSER_ACTIONS, ...DESKTOP_ACTIONS];

function normalizeToolName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[.\-:/\s]+/g, '_')
    .replace(/_+/g, '_');
}

const ALIAS_TO_CANONICAL = (() => {
  const map = new Map<string, string>();
  for (const action of ALL_ACTIONS) {
    map.set(normalizeToolName(action.toolName), action.toolName);
    for (const alias of action.aliases) {
      map.set(normalizeToolName(alias), action.toolName);
    }
  }
  return map;
})();

export function listCanonicalComputerUseActions(): CanonicalComputerUseAction[] {
  return ALL_ACTIONS;
}

export function resolveCanonicalComputerUseToolName(toolName: string): string | undefined {
  if (!toolName) return undefined;
  return ALIAS_TO_CANONICAL.get(normalizeToolName(toolName));
}

export function isCanonicalComputerUseTool(toolName: string): boolean {
  const canonical = resolveCanonicalComputerUseToolName(toolName);
  return canonical === toolName;
}

