import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { platform } from 'node:os';
import { spawn } from 'node:child_process';
import type { Browser, BrowserContext, Download, Page } from 'playwright';
import { chromium } from 'playwright';

export type BrowserDriverMode = 'auto' | 'cdp' | 'headless' | 'remote';
export type ResolvedBrowserDriverMode = Exclude<BrowserDriverMode, 'auto'>;

export interface BrowserRuntimeConfig {
  enabled: boolean;
  mode: BrowserDriverMode;
  cdpPort: number;
  remoteUrl: string;
  chromePath: string;
  launchHostBrowser: boolean;
  navigationTimeoutMs: number;
  actionTimeoutMs: number;
  downloadDir: string;
}

interface BrowserSessionState {
  sessionId: string;
  page: Page;
  context: BrowserContext;
  ownsContext: boolean;
}

export interface BrowserNavigateArgs {
  url: string;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
  timeoutMs?: number;
}

export interface BrowserClickArgs {
  selector: string;
  timeoutMs?: number;
}

export interface BrowserTypeArgs {
  selector: string;
  text: string;
  clearExisting?: boolean;
  timeoutMs?: number;
}

export interface BrowserSelectArgs {
  selector: string;
  value: string | string[];
  timeoutMs?: number;
}

export interface BrowserWaitForArgs {
  selector: string;
  state?: 'attached' | 'detached' | 'visible' | 'hidden';
  timeoutMs?: number;
}

export interface BrowserExtractTextArgs {
  selector: string;
  timeoutMs?: number;
}

export interface BrowserScreenshotArgs {
  fullPage?: boolean;
  timeoutMs?: number;
}

export interface BrowserDownloadArgs {
  selector?: string;
  url?: string;
  saveAs?: string;
  timeoutMs?: number;
}

export interface BrowserUploadArgs {
  selector: string;
  path: string;
  timeoutMs?: number;
}

export interface BrowserToolResult {
  text: string;
  imageBase64?: string;
  mediaType?: string;
  artifactPath?: string;
  downloadPath?: string;
  metadata?: Record<string, unknown>;
}

export interface BrowserToolRuntime {
  navigate(sessionId: string, args: BrowserNavigateArgs): Promise<BrowserToolResult>;
  click(sessionId: string, args: BrowserClickArgs): Promise<BrowserToolResult>;
  type(sessionId: string, args: BrowserTypeArgs): Promise<BrowserToolResult>;
  select(sessionId: string, args: BrowserSelectArgs): Promise<BrowserToolResult>;
  waitFor(sessionId: string, args: BrowserWaitForArgs): Promise<BrowserToolResult>;
  extractText(sessionId: string, args: BrowserExtractTextArgs): Promise<BrowserToolResult>;
  screenshot(sessionId: string, args: BrowserScreenshotArgs): Promise<BrowserToolResult>;
  download(sessionId: string, args: BrowserDownloadArgs): Promise<BrowserToolResult>;
  upload(sessionId: string, args: BrowserUploadArgs): Promise<BrowserToolResult>;
  closeSession(sessionId: string): Promise<BrowserToolResult>;
  getResolvedMode(): ResolvedBrowserDriverMode | null;
  dispose(): Promise<void>;
}

export interface BrowserToolError extends Error {
  code:
    | 'BROWSER_TIMEOUT'
    | 'ELEMENT_NOT_FOUND'
    | 'ELEMENT_NOT_INTERACTABLE'
    | 'NAVIGATION_BLOCKED'
    | 'DOWNLOAD_FAILED'
    | 'UPLOAD_FAILED'
    | 'SESSION_CLOSED'
    | 'CAPABILITY_UNAVAILABLE'
    | 'UNKNOWN';
  retryable: boolean;
}

export function createBrowserToolError(
  code: BrowserToolError['code'],
  message: string,
  retryable = true,
): BrowserToolError {
  const error = new Error(`${code}: ${message}`) as BrowserToolError;
  error.code = code;
  error.retryable = retryable;
  return error;
}

export function createDefaultBrowserRuntimeConfig(
  partial: Partial<BrowserRuntimeConfig> = {},
): BrowserRuntimeConfig {
  return {
    enabled: partial.enabled ?? true,
    mode: partial.mode ?? 'auto',
    cdpPort: partial.cdpPort ?? 9222,
    remoteUrl: partial.remoteUrl ?? '',
    chromePath: partial.chromePath ?? '',
    launchHostBrowser: partial.launchHostBrowser ?? false,
    navigationTimeoutMs: partial.navigationTimeoutMs ?? 30_000,
    actionTimeoutMs: partial.actionTimeoutMs ?? 10_000,
    downloadDir: partial.downloadDir || join(process.cwd(), '.lydia-artifacts', 'browser-downloads'),
  };
}

export class BrowserAutomationManager implements BrowserToolRuntime {
  private readonly config: BrowserRuntimeConfig;
  private readonly sessions = new Map<string, BrowserSessionState>();
  private browser: Browser | null = null;
  private resolvedMode: ResolvedBrowserDriverMode | null = null;
  private attemptedHostLaunch = false;

  constructor(config: Partial<BrowserRuntimeConfig> = {}) {
    this.config = createDefaultBrowserRuntimeConfig(config);
  }

  getResolvedMode(): ResolvedBrowserDriverMode | null {
    return this.resolvedMode;
  }

  async navigate(sessionId: string, args: BrowserNavigateArgs): Promise<BrowserToolResult> {
    const page = await this.getPage(sessionId);
    const response = await page.goto(args.url, {
      waitUntil: args.waitUntil ?? 'domcontentloaded',
      timeout: args.timeoutMs ?? this.config.navigationTimeoutMs,
    });
    return {
      text: `Navigated to ${page.url()} (${await page.title() || 'untitled'}) [mode=${this.getResolvedMode() || 'unknown'} status=${response?.status() ?? 'n/a'}]`,
      metadata: {
        url: page.url(),
        title: await page.title(),
        status: response?.status() ?? null,
        mode: this.getResolvedMode(),
      },
    };
  }

  async click(sessionId: string, args: BrowserClickArgs): Promise<BrowserToolResult> {
    const page = await this.getPage(sessionId);
    const locator = page.locator(args.selector).first();
    await locator.waitFor({ state: 'visible', timeout: args.timeoutMs ?? this.config.actionTimeoutMs });
    await locator.click({ timeout: args.timeoutMs ?? this.config.actionTimeoutMs });
    return {
      text: `Clicked ${args.selector} on ${page.url()}`,
      metadata: { url: page.url(), selector: args.selector, mode: this.getResolvedMode() },
    };
  }

  async type(sessionId: string, args: BrowserTypeArgs): Promise<BrowserToolResult> {
    const page = await this.getPage(sessionId);
    const locator = page.locator(args.selector).first();
    await locator.waitFor({ state: 'visible', timeout: args.timeoutMs ?? this.config.actionTimeoutMs });
    if (args.clearExisting !== false) {
      await locator.fill('', { timeout: args.timeoutMs ?? this.config.actionTimeoutMs });
    }
    await locator.fill(args.text, { timeout: args.timeoutMs ?? this.config.actionTimeoutMs });
    return {
      text: `Typed into ${args.selector} on ${page.url()}`,
      metadata: { url: page.url(), selector: args.selector, length: args.text.length },
    };
  }

  async select(sessionId: string, args: BrowserSelectArgs): Promise<BrowserToolResult> {
    const page = await this.getPage(sessionId);
    const values = Array.isArray(args.value) ? args.value : [args.value];
    await page.locator(args.selector).first().selectOption(values, {
      timeout: args.timeoutMs ?? this.config.actionTimeoutMs,
    });
    return {
      text: `Selected ${values.join(', ')} in ${args.selector} on ${page.url()}`,
      metadata: { url: page.url(), selector: args.selector, values },
    };
  }

  async waitFor(sessionId: string, args: BrowserWaitForArgs): Promise<BrowserToolResult> {
    const page = await this.getPage(sessionId);
    const state = args.state ?? 'visible';
    await page.locator(args.selector).first().waitFor({
      state,
      timeout: args.timeoutMs ?? this.config.actionTimeoutMs,
    });
    return {
      text: `Wait condition satisfied for ${args.selector} (${state}) on ${page.url()}`,
      metadata: { url: page.url(), selector: args.selector, state },
    };
  }

  async extractText(sessionId: string, args: BrowserExtractTextArgs): Promise<BrowserToolResult> {
    const page = await this.getPage(sessionId);
    const locator = page.locator(args.selector).first();
    await locator.waitFor({ state: 'attached', timeout: args.timeoutMs ?? this.config.actionTimeoutMs });
    const text = (await locator.innerText({ timeout: args.timeoutMs ?? this.config.actionTimeoutMs })).trim();
    return {
      text: text || `[empty text at ${args.selector}]`,
      metadata: { url: page.url(), selector: args.selector },
    };
  }

  async screenshot(sessionId: string, args: BrowserScreenshotArgs): Promise<BrowserToolResult> {
    const page = await this.getPage(sessionId);
    const buffer = await page.screenshot({
      fullPage: args.fullPage ?? true,
      timeout: args.timeoutMs ?? this.config.navigationTimeoutMs,
      type: 'png',
    });
    return {
      text: `Captured screenshot for ${page.url()} [mode=${this.getResolvedMode() || 'unknown'}]`,
      imageBase64: buffer.toString('base64'),
      mediaType: 'image/png',
      metadata: { url: page.url(), fullPage: args.fullPage ?? true },
    };
  }

  async download(sessionId: string, args: BrowserDownloadArgs): Promise<BrowserToolResult> {
    const page = await this.getPage(sessionId);
    if (!args.selector && !args.url) {
      throw createBrowserToolError('DOWNLOAD_FAILED', 'Either "selector" or "url" is required.', false);
    }

    const timeout = args.timeoutMs ?? this.config.navigationTimeoutMs;
    const downloadPromise = page.waitForEvent('download', { timeout });
    if (args.selector) {
      await page.locator(args.selector).first().click({ timeout });
    } else if (args.url) {
      await page.goto(args.url, { waitUntil: 'commit', timeout });
    }
    const download = await downloadPromise;
    const downloadPath = await this.saveDownload(download, args.saveAs);
    return {
      text: `Downloaded artifact to ${downloadPath}`,
      downloadPath,
      metadata: { url: page.url(), suggestedFilename: download.suggestedFilename() },
    };
  }

  async upload(sessionId: string, args: BrowserUploadArgs): Promise<BrowserToolResult> {
    const page = await this.getPage(sessionId);
    const locator = page.locator(args.selector).first();
    await locator.setInputFiles(resolve(args.path), {
      timeout: args.timeoutMs ?? this.config.actionTimeoutMs,
    });
    return {
      text: `Uploaded ${resolve(args.path)} into ${args.selector}`,
      artifactPath: resolve(args.path),
      metadata: { url: page.url(), selector: args.selector, path: resolve(args.path) },
    };
  }

  async closeSession(sessionId: string): Promise<BrowserToolResult> {
    const state = this.sessions.get(sessionId);
    if (!state) {
      return {
        text: `Session ${sessionId} already closed`,
        metadata: { sessionId, mode: this.getResolvedMode() },
      };
    }

    try {
      if (!state.page.isClosed()) {
        await state.page.close();
      }
      if (state.ownsContext) {
        await state.context.close();
      }
    } finally {
      this.sessions.delete(sessionId);
    }

    return {
      text: `Closed browser session ${sessionId}`,
      metadata: { sessionId, mode: this.getResolvedMode() },
    };
  }

  async dispose(): Promise<void> {
    const ids = Array.from(this.sessions.keys());
    for (const sessionId of ids) {
      await this.closeSession(sessionId);
    }
    if (this.browser) {
      await this.browser.close();
    }
    this.browser = null;
    this.resolvedMode = null;
  }

  private async getPage(sessionId: string): Promise<Page> {
    const existing = this.sessions.get(sessionId);
    if (existing && !existing.page.isClosed()) {
      return existing.page;
    }

    const browser = await this.ensureBrowser();
    const mode = this.resolvedMode;
    if (!mode) {
      throw createBrowserToolError('CAPABILITY_UNAVAILABLE', 'Browser mode could not be resolved.', false);
    }

    let context: BrowserContext;
    let ownsContext = true;

    if (mode === 'cdp') {
      context = browser.contexts()[0] || await browser.newContext({ acceptDownloads: true });
      ownsContext = false;
    } else {
      context = await browser.newContext({ acceptDownloads: true });
    }

    const page = await context.newPage();
    const session: BrowserSessionState = {
      sessionId,
      page,
      context,
      ownsContext,
    };
    this.sessions.set(sessionId, session);
    return page;
  }

  private async ensureBrowser(): Promise<Browser> {
    if (!this.config.enabled) {
      throw createBrowserToolError('CAPABILITY_UNAVAILABLE', 'Browser automation is disabled in config.', false);
    }
    if (this.browser) return this.browser;

    const desiredMode = this.config.mode;
    if (desiredMode === 'cdp') {
      this.browser = await this.connectCdpOrThrow();
      this.resolvedMode = 'cdp';
      return this.browser;
    }
    if (desiredMode === 'remote') {
      this.browser = await this.connectRemoteOrThrow();
      this.resolvedMode = 'remote';
      return this.browser;
    }
    if (desiredMode === 'headless') {
      this.browser = await this.connectHeadless();
      this.resolvedMode = 'headless';
      return this.browser;
    }

    try {
      this.browser = await this.connectCdpOrThrow();
      this.resolvedMode = 'cdp';
      return this.browser;
    } catch {}

    if (this.config.remoteUrl) {
      try {
        this.browser = await this.connectRemoteOrThrow();
        this.resolvedMode = 'remote';
        return this.browser;
      } catch {}
    }

    this.browser = await this.connectHeadless();
    this.resolvedMode = 'headless';
    return this.browser;
  }

  private async connectCdpOrThrow(): Promise<Browser> {
    const url = `http://127.0.0.1:${this.config.cdpPort}`;
    const reachable = await this.isCdpReachable(url);
    if (!reachable && this.config.launchHostBrowser && !this.attemptedHostLaunch) {
      this.launchHostChrome();
      this.attemptedHostLaunch = true;
      await sleep(1500);
    }

    const reachableAfterLaunch = await this.isCdpReachable(url);
    if (!reachableAfterLaunch) {
      throw createBrowserToolError(
        'CAPABILITY_UNAVAILABLE',
        `CDP endpoint ${url} is not reachable.`,
        false,
      );
    }
    return chromium.connectOverCDP(url);
  }

  private async connectRemoteOrThrow(): Promise<Browser> {
    if (!this.config.remoteUrl) {
      throw createBrowserToolError('CAPABILITY_UNAVAILABLE', 'Remote browser URL is not configured.', false);
    }
    return chromium.connectOverCDP(this.config.remoteUrl);
  }

  private async connectHeadless(): Promise<Browser> {
    return chromium.launch({
      headless: true,
      args: ['--disable-dev-shm-usage', '--no-sandbox'],
    });
  }

  private async isCdpReachable(baseUrl: string): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1500);
      try {
        const response = await fetch(`${baseUrl}/json/version`, {
          signal: controller.signal,
        });
        return response.ok;
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      return false;
    }
  }

  private launchHostChrome(): void {
    const binary = this.resolveChromeBinary();
    if (!binary) {
      throw createBrowserToolError(
        'CAPABILITY_UNAVAILABLE',
        'CDP launch requested but no Chrome executable could be resolved.',
        false,
      );
    }

    const userDataDir = join(process.cwd(), '.lydia-artifacts', 'chrome-profile');
    const args = [
      `--remote-debugging-port=${this.config.cdpPort}`,
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${userDataDir}`,
    ];

    spawn(binary, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    }).unref();
  }

  private resolveChromeBinary(): string | null {
    if (this.config.chromePath) {
      return this.config.chromePath;
    }

    const os = platform();
    if (os === 'win32') {
      return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    }
    if (os === 'darwin') {
      return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    }
    return 'google-chrome';
  }

  private async saveDownload(download: Download, requestedPath?: string): Promise<string> {
    const filename = requestedPath
      ? resolve(requestedPath)
      : resolve(this.config.downloadDir, `${Date.now().toString(36)}-${download.suggestedFilename()}`);
    await mkdir(dirname(filename), { recursive: true });
    await download.saveAs(filename);
    return filename;
  }
}

export function normalizeBrowserRuntimeError(error: unknown): BrowserToolError {
  if (error && typeof error === 'object' && 'code' in error && typeof (error as BrowserToolError).code === 'string') {
    return error as BrowserToolError;
  }

  if (error instanceof Error) {
    const message = error.message || 'Unknown browser error';
    const lowered = message.toLowerCase();
    if (lowered.includes('timeout')) {
      return createBrowserToolError('BROWSER_TIMEOUT', message, true);
    }
    if (lowered.includes('not found') || lowered.includes('waiting for locator')) {
      return createBrowserToolError('ELEMENT_NOT_FOUND', message, true);
    }
    if (lowered.includes('not visible') || lowered.includes('not enabled') || lowered.includes('intercept')) {
      return createBrowserToolError('ELEMENT_NOT_INTERACTABLE', message, true);
    }
    if (lowered.includes('net::') || lowered.includes('navigation')) {
      return createBrowserToolError('NAVIGATION_BLOCKED', message, true);
    }
    if (lowered.includes('download')) {
      return createBrowserToolError('DOWNLOAD_FAILED', message, true);
    }
    if (lowered.includes('upload') || lowered.includes('input files')) {
      return createBrowserToolError('UPLOAD_FAILED', message, true);
    }
    if (lowered.includes('target page, context or browser has been closed')) {
      return createBrowserToolError('SESSION_CLOSED', message, true);
    }
    if (lowered.includes('executable') || lowered.includes('playwright')) {
      return createBrowserToolError('CAPABILITY_UNAVAILABLE', message, false);
    }
    return createBrowserToolError('UNKNOWN', message, true);
  }

  return createBrowserToolError('UNKNOWN', String(error), true);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}
