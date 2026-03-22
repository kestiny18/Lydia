import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { BrowserServer } from './browser.js';
import type { BrowserToolRuntime } from '../../browser/index.js';

function createRuntimeStub(): BrowserToolRuntime {
  return {
    async navigate(sessionId, args) {
      return { text: `navigate:${sessionId}:${args.url}` };
    },
    async click(sessionId, args) {
      return { text: `click:${sessionId}:${args.selector}` };
    },
    async type(sessionId, args) {
      return { text: `type:${sessionId}:${args.selector}:${args.text}` };
    },
    async select(sessionId, args) {
      return { text: `select:${sessionId}:${args.selector}:${Array.isArray(args.value) ? args.value.join(',') : args.value}` };
    },
    async waitFor(sessionId, args) {
      return { text: `wait:${sessionId}:${args.selector}` };
    },
    async extractText(sessionId, args) {
      return { text: `extract:${sessionId}:${args.selector}` };
    },
    async screenshot(sessionId) {
      return {
        text: `screenshot:${sessionId}`,
        imageBase64: Buffer.from('png').toString('base64'),
        mediaType: 'image/png',
      };
    },
    async download(sessionId) {
      return {
        text: `download:${sessionId}`,
        downloadPath: '/tmp/download.txt',
      };
    },
    async upload(sessionId, args) {
      return {
        text: `upload:${sessionId}:${args.path}`,
        artifactPath: args.path,
      };
    },
    async closeSession(sessionId) {
      return { text: `close:${sessionId}` };
    },
    getResolvedMode() {
      return 'headless';
    },
    async dispose() {},
  };
}

async function connectServer(server: BrowserServer): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.server.connect(serverTransport);
  const client = new Client(
    {
      name: 'browser-test-client',
      version: '0.1.2',
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );
  await client.connect(clientTransport);
  return client;
}

describe('BrowserServer', () => {
  it('lists canonical Lydia browser tools', async () => {
    const client = await connectServer(new BrowserServer({}, createRuntimeStub()));
    const tools = await client.listTools();

    expect(tools.tools.map((tool) => tool.name)).toEqual([
      'browser_navigate',
      'browser_click',
      'browser_type',
      'browser_select',
      'browser_wait_for',
      'browser_extract_text',
      'browser_screenshot',
      'browser_download',
      'browser_upload',
      'browser_close',
    ]);
  });

  it('passes Lydia session id through tool calls and emits image evidence', async () => {
    const client = await connectServer(new BrowserServer({}, createRuntimeStub()));
    const result = await client.callTool({
      name: 'browser_screenshot',
      arguments: { __lydiaSessionId: 'cus-123' },
    });

    expect(result.isError).toBeFalsy();
    expect(result.content[0]).toMatchObject({ type: 'text', text: 'screenshot:cus-123' });
    expect(result.content[1]).toMatchObject({
      type: 'image',
      mimeType: 'image/png',
    });
  });

  it('returns MCP errors when the runtime throws', async () => {
    const runtime = createRuntimeStub();
    runtime.click = async () => {
      throw new Error('selector not found');
    };
    const client = await connectServer(new BrowserServer({}, runtime));
    const result = await client.callTool({
      name: 'browser_click',
      arguments: { selector: '#missing', __lydiaSessionId: 'cus-456' },
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('ELEMENT_NOT_FOUND'),
    });
  });
});
