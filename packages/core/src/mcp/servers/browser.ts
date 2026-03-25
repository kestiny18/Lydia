import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  BrowserAutomationManager,
  createDefaultBrowserRuntimeConfig,
  normalizeBrowserRuntimeError,
  type BrowserRuntimeConfig,
  type BrowserToolRuntime,
  type BrowserToolResult,
} from '../../browser/index.js';

const SESSION_ARG = '__lydiaSessionId';

type ToolHandler = (sessionId: string, args: Record<string, unknown>) => Promise<BrowserToolResult>;

// Schema-only tool specs — adding a new tool only requires adding one entry here.
// The handler registry is built from this array, so schema and handler always stay in sync.
const TOOL_SCHEMAS: Array<{ name: string; description: string; schema: Tool['inputSchema'] }> = [
  {
    name: 'browser_navigate',
    description: 'Navigate the current browser session to a URL.',
    schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Destination URL' },
        waitUntil: {
          type: 'string',
          enum: ['load', 'domcontentloaded', 'networkidle', 'commit'],
          description: 'Navigation completion condition',
        },
        timeoutMs: { type: 'number', description: 'Optional timeout override in milliseconds' },
      },
      required: ['url'],
    },
  },
  {
    name: 'browser_click',
    description: 'Click an element in the current page by selector.',
    schema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector for the target element' },
        timeoutMs: { type: 'number', description: 'Optional timeout override in milliseconds' },
      },
      required: ['selector'],
    },
  },
  {
    name: 'browser_type',
    description: 'Type text into an element in the current page.',
    schema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector for the target input' },
        text: { type: 'string', description: 'Text to enter' },
        clearExisting: { type: 'boolean', description: 'Clear existing value before typing' },
        timeoutMs: { type: 'number', description: 'Optional timeout override in milliseconds' },
      },
      required: ['selector', 'text'],
    },
  },
  {
    name: 'browser_select',
    description: 'Select one or more values from a select element.',
    schema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector for the select element' },
        value: {
          oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
          description: 'Value or list of values to select',
        },
        timeoutMs: { type: 'number', description: 'Optional timeout override in milliseconds' },
      },
      required: ['selector', 'value'],
    },
  },
  {
    name: 'browser_wait_for',
    description: 'Wait for a selector to reach a state.',
    schema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector to wait for' },
        state: {
          type: 'string',
          enum: ['attached', 'detached', 'visible', 'hidden'],
          description: 'Target element state',
        },
        timeoutMs: { type: 'number', description: 'Optional timeout override in milliseconds' },
      },
      required: ['selector'],
    },
  },
  {
    name: 'browser_extract_text',
    description: 'Extract visible text from an element.',
    schema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector for the text source' },
        timeoutMs: { type: 'number', description: 'Optional timeout override in milliseconds' },
      },
      required: ['selector'],
    },
  },
  {
    name: 'browser_screenshot',
    description: 'Capture a screenshot of the current page.',
    schema: {
      type: 'object',
      properties: {
        fullPage: { type: 'boolean', description: 'Capture the full page instead of only the viewport' },
        timeoutMs: { type: 'number', description: 'Optional timeout override in milliseconds' },
      },
    },
  },
  {
    name: 'browser_download',
    description: 'Download a browser artifact from a URL or via a click action.',
    schema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'Selector to click to trigger a download' },
        url: { type: 'string', description: 'Direct download URL' },
        saveAs: { type: 'string', description: 'Optional output path override' },
        timeoutMs: { type: 'number', description: 'Optional timeout override in milliseconds' },
      },
    },
  },
  {
    name: 'browser_upload',
    description: 'Upload a local file into a file input element.',
    schema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector for the file input' },
        path: { type: 'string', description: 'Absolute or relative local file path' },
        timeoutMs: { type: 'number', description: 'Optional timeout override in milliseconds' },
      },
      required: ['selector', 'path'],
    },
  },
  {
    name: 'browser_press_key',
    description: 'Press a keyboard key or key combination (e.g. Enter, Tab, Escape, Control+c).',
    schema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Key name or chord (e.g. "Enter", "Tab", "Escape", "Control+a")' },
        timeoutMs: { type: 'number', description: 'Optional timeout override in milliseconds' },
      },
      required: ['key'],
    },
  },
  {
    name: 'browser_hover',
    description: 'Hover the mouse pointer over an element to reveal hidden menus or tooltips.',
    schema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector for the element to hover over' },
        timeoutMs: { type: 'number', description: 'Optional timeout override in milliseconds' },
      },
      required: ['selector'],
    },
  },
  {
    name: 'browser_scroll',
    description: 'Scroll the page or a specific element. Use a negative deltaY to scroll up.',
    schema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'Optional CSS selector of the element to scroll (scrolls page if omitted)' },
        deltaY: { type: 'number', description: 'Number of pixels to scroll vertically (positive = down, negative = up). Default: 300' },
        timeoutMs: { type: 'number', description: 'Optional timeout override in milliseconds' },
      },
    },
  },
  {
    name: 'browser_back',
    description: 'Navigate back one page in browser history.',
    schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'browser_forward',
    description: 'Navigate forward one page in browser history.',
    schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'browser_close',
    description: 'Close the current Lydia browser session.',
    schema: {
      type: 'object',
      properties: {},
    },
  },
];

/** O(1) handler lookup — switch lives in one place only. Adding a tool = add one case. */
function buildHandlerRegistry(runtime: BrowserToolRuntime): Map<string, ToolHandler> {
  const registry = new Map<string, ToolHandler>();

  for (const spec of TOOL_SCHEMAS) {
    registry.set(spec.name, (sessionId, args) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const a = args as any;
      switch (spec.name) {
        case 'browser_navigate':
          return runtime.navigate(sessionId, a);
        case 'browser_click':
          return runtime.click(sessionId, a);
        case 'browser_type':
          return runtime.type(sessionId, a);
        case 'browser_select':
          return runtime.select(sessionId, a);
        case 'browser_wait_for':
          return runtime.waitFor(sessionId, a);
        case 'browser_extract_text':
          return runtime.extractText(sessionId, a);
        case 'browser_screenshot':
          return runtime.screenshot(sessionId, a);
        case 'browser_download':
          return runtime.download(sessionId, a);
        case 'browser_upload':
          return runtime.upload(sessionId, a);
        case 'browser_press_key':
          return runtime.pressKey(sessionId, a);
        case 'browser_hover':
          return runtime.hover(sessionId, a);
        case 'browser_scroll':
          return runtime.scroll(sessionId, a);
        case 'browser_back':
          return runtime.back(sessionId);
        case 'browser_forward':
          return runtime.forward(sessionId);
        case 'browser_close':
          return runtime.closeSession(sessionId);
        default:
          return Promise.reject(new Error(`Unknown tool: ${spec.name}`));
      }
    });
  }

  return registry;
}

export class BrowserServer {
  public readonly server: Server;
  private readonly runtime: BrowserToolRuntime;
  private readonly handlerRegistry: Map<string, ToolHandler>;

  constructor(
    config: Partial<BrowserRuntimeConfig> = {},
    runtime: BrowserToolRuntime = new BrowserAutomationManager(createDefaultBrowserRuntimeConfig(config)),
  ) {
    this.runtime = runtime;
    // Handler registry is built once at construction — map stays stable after init.
    this.handlerRegistry = buildHandlerRegistry(runtime);

    this.server = new Server(
      {
        name: 'internal-browser',
        version: '0.2.0',
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.setupHandlers();
  }

  async closeSession(sessionId: string): Promise<void> {
    if (!sessionId) return;
    await this.runtime.closeSession(sessionId);
  }

  async dispose(): Promise<void> {
    await this.runtime.dispose();
  }

  private setupHandlers(): void {
    // Schema and handler come from the same source — impossible to get out of sync.
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: TOOL_SCHEMAS.map((spec) => ({
        name: spec.name,
        description: spec.description,
        inputSchema: spec.schema,
      })),
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const rawArgs = (request.params.arguments || {}) as Record<string, unknown>;
      const sessionId =
        typeof rawArgs[SESSION_ARG] === 'string' && rawArgs[SESSION_ARG]
          ? rawArgs[SESSION_ARG]
          : 'default';
      const args = Object.fromEntries(
        Object.entries(rawArgs).filter(([key]) => key !== SESSION_ARG),
      );

      try {
        const handler = this.handlerRegistry.get(request.params.name);
        if (!handler) {
          throw new Error(`Unknown tool: ${request.params.name}`);
        }
        return this.formatResult(await handler(sessionId, args));
      } catch (error) {
        const normalized = normalizeBrowserRuntimeError(error);
        return {
          content: [{ type: 'text', text: `${normalized.code}: ${normalized.message}` }],
          isError: true,
        };
      }
    });
  }

  private formatResult(result: BrowserToolResult) {
    const content: Array<{ type: 'text' | 'image'; text?: string; data?: string; mimeType?: string }> = [
      { type: 'text', text: result.text },
    ];
    if (result.imageBase64 && result.mediaType) {
      content.push({
        type: 'image',
        data: result.imageBase64,
        mimeType: result.mediaType,
      });
    }
    return {
      content,
      artifactPath: result.artifactPath,
      downloadPath: result.downloadPath,
      metadata: result.metadata,
    };
  }
}
