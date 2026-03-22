import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import {
  BrowserAutomationManager,
  createDefaultBrowserRuntimeConfig,
  normalizeBrowserRuntimeError,
  type BrowserRuntimeConfig,
  type BrowserToolRuntime,
} from '../../browser/index.js';

const SESSION_ARG = '__lydiaSessionId';

export class BrowserServer {
  public readonly server: Server;
  private readonly runtime: BrowserToolRuntime;

  constructor(
    config: Partial<BrowserRuntimeConfig> = {},
    runtime: BrowserToolRuntime = new BrowserAutomationManager(createDefaultBrowserRuntimeConfig(config)),
  ) {
    this.runtime = runtime;
    this.server = new Server(
      {
        name: 'internal-browser',
        version: '0.1.2',
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
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'browser_navigate',
          description: 'Navigate the current browser session to a URL.',
          inputSchema: {
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
          inputSchema: {
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
          inputSchema: {
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
          inputSchema: {
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
          inputSchema: {
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
          inputSchema: {
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
          inputSchema: {
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
          inputSchema: {
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
          inputSchema: {
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
          name: 'browser_close',
          description: 'Close the current Lydia browser session.',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const rawArgs = (request.params.arguments || {}) as Record<string, unknown>;
      const sessionId = typeof rawArgs[SESSION_ARG] === 'string' && rawArgs[SESSION_ARG]
        ? rawArgs[SESSION_ARG]
        : 'default';
      const args = Object.fromEntries(
        Object.entries(rawArgs).filter(([key]) => key !== SESSION_ARG),
      );

      try {
        switch (request.params.name) {
          case 'browser_navigate':
            return this.ok(await this.runtime.navigate(sessionId, args as any));
          case 'browser_click':
            return this.ok(await this.runtime.click(sessionId, args as any));
          case 'browser_type':
            return this.ok(await this.runtime.type(sessionId, args as any));
          case 'browser_select':
            return this.ok(await this.runtime.select(sessionId, args as any));
          case 'browser_wait_for':
            return this.ok(await this.runtime.waitFor(sessionId, args as any));
          case 'browser_extract_text':
            return this.ok(await this.runtime.extractText(sessionId, args as any));
          case 'browser_screenshot':
            return this.ok(await this.runtime.screenshot(sessionId, args as any));
          case 'browser_download':
            return this.ok(await this.runtime.download(sessionId, args as any));
          case 'browser_upload':
            return this.ok(await this.runtime.upload(sessionId, args as any));
          case 'browser_close':
            return this.ok(await this.runtime.closeSession(sessionId));
          default:
            throw new Error(`Unknown tool: ${request.params.name}`);
        }
      } catch (error) {
        const normalized = normalizeBrowserRuntimeError(error);
        return {
          content: [{ type: 'text', text: normalized.message }],
          isError: true,
        };
      }
    });
  }

  private ok(result: Awaited<ReturnType<BrowserToolRuntime['navigate']>>) {
    const content: Array<any> = [{ type: 'text', text: result.text }];
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
