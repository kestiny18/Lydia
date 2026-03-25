import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { BrowserContext, Download } from 'playwright';
import { BrowserConnector } from './connector.js';

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
  /** Idle time in ms before an unused session is automatically closed. Default: 5 min. */
  idleTimeoutMs: number;
  /** How often to check for idle sessions. Default: 30 s. */
  idleCheckIntervalMs: number;
}

interface BrowserSessionState {
  sessionId: string;
  page: import('playwright').Page;
  context: BrowserContext;
  ownsContext: boolean;
  lastAccessedAt: number;
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

export interface BrowserPressKeyArgs {
  key: string;
  timeoutMs?: number;
}

export interface BrowserHoverArgs {
  selector: string;
  timeoutMs?: number;
}

export interface BrowserScrollArgs {
  selector?: string;
  deltaY?: number;
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
  pressKey(sessionId: string, args: BrowserPressKeyArgs): Promise<BrowserToolResult>;
  hover(sessionId: string, args: BrowserHoverArgs): Promise<BrowserToolResult>;
  scroll(sessionId: string, args: BrowserScrollArgs): Promise<BrowserToolResult>;
  back(sessionId: string): Promise<BrowserToolResult>;
  forward(sessionId: string): Promise<BrowserToolResult>;
  closeSession(sessionId: string): Promise<BrowserToolResult>;
  getResolvedMode(): ResolvedBrowserDriverMode | null;
  dispose(): Promise<void>;
}

/** Error codes that BrowserAutomationManager operations can produce. */
export type BrowserToolErrorCode =
  | 'BROWSER_TIMEOUT'
  | 'ELEMENT_NOT_FOUND'
  | 'ELEMENT_NOT_INTERACTABLE'
  | 'NAVIGATION_BLOCKED'
  | 'DOWNLOAD_FAILED'
  | 'UPLOAD_FAILED'
  | 'SESSION_CLOSED'
  | 'CAPABILITY_UNAVAILABLE'
  | 'UNKNOWN';

/** Properly-extends_Error typed error for browser operations.
 *  Instances carry a machine-readable `code` and a `retryable` flag
 *  so the agent can decide whether to re-attempt without parsing message text. */
export class BrowserToolError extends Error {
  readonly code: BrowserToolErrorCode;
  readonly retryable: boolean;

  constructor(code: BrowserToolErrorCode, message: string, retryable = true) {
    super(message);
    this.name = 'BrowserToolError';
    this.code = code;
    this.retryable = retryable;
    // Maintains proper stack traces in V8 environments (Node.js / Playwright)
    Error.captureStackTrace(this, BrowserToolError);
  }
}

export function createBrowserToolError(
  code: BrowserToolErrorCode,
  message: string,
  retryable = true,
): BrowserToolError {
  return new BrowserToolError(code, message, retryable);
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
    idleTimeoutMs: partial.idleTimeoutMs ?? 5 * 60 * 1000,
    idleCheckIntervalMs: partial.idleCheckIntervalMs ?? 30_000,
  };
}

export class BrowserAutomationManager implements BrowserToolRuntime {
  private readonly config: BrowserRuntimeConfig;
  private readonly sessions = new Map<string, BrowserSessionState>();
  private readonly connector: BrowserConnector;
  private idleTimer: ReturnType<typeof setInterval> | null = null;
  private disposed = false;

  constructor(config: Partial<BrowserRuntimeConfig> = {}) {
    this.config = createDefaultBrowserRuntimeConfig(config);
    this.connector = new BrowserConnector({
      mode: this.config.mode,
      cdpPort: this.config.cdpPort,
      remoteUrl: this.config.remoteUrl,
      chromePath: this.config.chromePath,
      launchHostBrowser: this.config.launchHostBrowser,
    });
  }

  getResolvedMode(): ResolvedBrowserDriverMode | null {
    return this.connector.getResolvedMode();
  }

  // -------------------------------------------------------------------------
  // Tool operations — each touches a session and records access time.
  // -------------------------------------------------------------------------

  async navigate(sessionId: string, args: BrowserNavigateArgs): Promise<BrowserToolResult> {
    this.touch(sessionId);
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
    this.touch(sessionId);
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
    this.touch(sessionId);
    const page = await this.getPage(sessionId);
    const locator = page.locator(args.selector).first();
    await locator.waitFor({ state: 'visible', timeout: args.timeoutMs ?? this.config.actionTimeoutMs });
    if (args.clearExisting === false) {
      // Use click+type so we don't overwrite existing content when clearExisting=false.
      await locator.click({ timeout: args.timeoutMs ?? this.config.actionTimeoutMs });
      await locator.type(args.text, { timeout: args.timeoutMs ?? this.config.actionTimeoutMs });
    } else {
      // locator.fill() automatically clears existing value.
      await locator.fill(args.text, { timeout: args.timeoutMs ?? this.config.actionTimeoutMs });
    }
    return {
      text: `Typed into ${args.selector} on ${page.url()}`,
      metadata: { url: page.url(), selector: args.selector, length: args.text.length },
    };
  }

  async select(sessionId: string, args: BrowserSelectArgs): Promise<BrowserToolResult> {
    this.touch(sessionId);
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
    this.touch(sessionId);
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
    this.touch(sessionId);
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
    this.touch(sessionId);
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
    this.touch(sessionId);
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
    this.touch(sessionId);
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

  async pressKey(sessionId: string, args: BrowserPressKeyArgs): Promise<BrowserToolResult> {
    this.touch(sessionId);
    const page = await this.getPage(sessionId);
    await page.keyboard.press(args.key, { delay: 0 });
    return {
      text: `Pressed key "${args.key}" on ${page.url()}`,
      metadata: { url: page.url(), key: args.key },
    };
  }

  async hover(sessionId: string, args: BrowserHoverArgs): Promise<BrowserToolResult> {
    this.touch(sessionId);
    const page = await this.getPage(sessionId);
    const locator = page.locator(args.selector).first();
    await locator.waitFor({ state: 'visible', timeout: args.timeoutMs ?? this.config.actionTimeoutMs });
    await locator.hover({ timeout: args.timeoutMs ?? this.config.actionTimeoutMs });
    return {
      text: `Hovered over ${args.selector} on ${page.url()}`,
      metadata: { url: page.url(), selector: args.selector },
    };
  }

  async scroll(sessionId: string, args: BrowserScrollArgs): Promise<BrowserToolResult> {
    this.touch(sessionId);
    const page = await this.getPage(sessionId);
    const deltaY = args.deltaY ?? 300;
    if (args.selector) {
      await page.locator(args.selector).first().scrollIntoViewIfNeeded();
    }
    await page.mouse.wheel(0, deltaY);
    return {
      text: `Scrolled ${deltaY}px ${args.selector ? `in ${args.selector}` : 'on page'} at ${page.url()}`,
      metadata: { url: page.url(), selector: args.selector ?? null, deltaY },
    };
  }

  async back(sessionId: string): Promise<BrowserToolResult> {
    this.touch(sessionId);
    const page = await this.getPage(sessionId);
    const response = await page.goBack({ timeout: this.config.navigationTimeoutMs });
    return {
      text: `Navigated back to ${page.url()} [status=${response?.status() ?? 'n/a'}]`,
      metadata: { url: page.url(), title: await page.title(), status: response?.status() ?? null },
    };
  }

  async forward(sessionId: string): Promise<BrowserToolResult> {
    this.touch(sessionId);
    const page = await this.getPage(sessionId);
    const response = await page.goForward({ timeout: this.config.navigationTimeoutMs });
    return {
      text: `Navigated forward to ${page.url()} [status=${response?.status() ?? 'n/a'}]`,
      metadata: { url: page.url(), title: await page.title(), status: response?.status() ?? null },
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
    if (this.disposed) return;
    this.disposed = true;

    this.stopIdleCleanup();

    const ids = Array.from(this.sessions.keys());
    for (const sessionId of ids) {
      await this.closeSession(sessionId);
    }

    await this.connector.close();
  }

  // -------------------------------------------------------------------------
  // Session management
  // -------------------------------------------------------------------------

  /** Returns the page for the given session, creating one if necessary.
   *  Also performs a health check: if the underlying browser process died,
   *  it is reconnected transparently. */
  private async getPage(sessionId: string): Promise<import('playwright').Page> {
    const existing = this.sessions.get(sessionId);
    if (existing && !existing.page.isClosed()) {
      return existing.page;
    }

    if (!this.connector.isHealthy()) {
      console.warn('[BrowserAutomationManager] Browser process unhealthy, reconnecting...');
      await this.connector.close();
    }

    const browser = await this.connector.ensureBrowser();
    const mode = this.connector.getResolvedMode();
    if (!mode) {
      throw createBrowserToolError('CAPABILITY_UNAVAILABLE', 'Browser mode could not be resolved.', false);
    }

    let context: BrowserContext;
    let ownsContext = true;

    if (mode === 'cdp') {
      context = browser.contexts()[0] || (await browser.newContext({ acceptDownloads: true }));
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
      lastAccessedAt: Date.now(),
    };
    this.sessions.set(sessionId, session);
    this.startIdleCleanup();
    return page;
  }

  /** Records that a tool operation just occurred on this session. */
  private touch(sessionId: string): void {
    const state = this.sessions.get(sessionId);
    if (state) {
      state.lastAccessedAt = Date.now();
    }
  }

  // -------------------------------------------------------------------------
  // Idle timeout cleanup
  // -------------------------------------------------------------------------

  private startIdleCleanup(): void {
    if (this.idleTimer !== null) return;
    if (this.config.idleTimeoutMs <= 0) return;

    this.idleTimer = setInterval(() => {
      const now = Date.now();
      for (const [sessionId, state] of this.sessions) {
        if (now - state.lastAccessedAt > this.config.idleTimeoutMs) {
          console.warn(`[BrowserAutomationManager] Closing idle session ${sessionId} (idle > ${this.config.idleTimeoutMs}ms)`);
          this.closeSession(sessionId).catch((err) =>
            console.warn(`[BrowserAutomationManager] Error closing idle session ${sessionId}:`, err),
          );
        }
      }
      // Stop the timer when there are no more sessions.
      if (this.sessions.size === 0) {
        this.stopIdleCleanup();
      }
    }, this.config.idleCheckIntervalMs);
  }

  private stopIdleCleanup(): void {
    if (this.idleTimer !== null) {
      clearInterval(this.idleTimer);
      this.idleTimer = null;
    }
  }

  // -------------------------------------------------------------------------
  // Download helpers
  // -------------------------------------------------------------------------

  private async saveDownload(download: Download, requestedPath?: string): Promise<string> {
    const filename = requestedPath
      ? resolve(requestedPath)
      : resolve(this.config.downloadDir, `${Date.now().toString(36)}-${download.suggestedFilename()}`);
    await mkdir(dirname(filename), { recursive: true });
    await download.saveAs(filename);
    return filename;
  }
}

// ---------------------------------------------------------------------------
// Error normalization
// ---------------------------------------------------------------------------

export function normalizeBrowserRuntimeError(error: unknown): BrowserToolError {
  // Already a BrowserToolError (or any object with .code + .message + .retryable).
  if (
    error &&
    typeof error === 'object' &&
    typeof (error as { code?: unknown }).code === 'string' &&
    typeof (error as { message?: unknown }).message === 'string' &&
    typeof (error as { retryable?: unknown }).retryable === 'boolean'
  ) {
    return error as BrowserToolError;
  }

  if (error instanceof Error) {
    const message = error.message || 'Unknown browser error';
    const lowered = message.toLowerCase();

    if (lowered.includes('timeout')) {
      return new BrowserToolError('BROWSER_TIMEOUT', message, true);
    }
    if (lowered.includes('not found') || lowered.includes('waiting for locator')) {
      return new BrowserToolError('ELEMENT_NOT_FOUND', message, true);
    }
    if (lowered.includes('not visible') || lowered.includes('not enabled') || lowered.includes('intercept')) {
      return new BrowserToolError('ELEMENT_NOT_INTERACTABLE', message, true);
    }
    if (lowered.includes('net::') || lowered.includes('navigation')) {
      return new BrowserToolError('NAVIGATION_BLOCKED', message, true);
    }
    if (lowered.includes('download')) {
      return new BrowserToolError('DOWNLOAD_FAILED', message, true);
    }
    if (lowered.includes('upload') || lowered.includes('input files')) {
      return new BrowserToolError('UPLOAD_FAILED', message, true);
    }
    if (lowered.includes('target page, context or browser has been closed')) {
      return new BrowserToolError('SESSION_CLOSED', message, true);
    }
    if (lowered.includes('executable') || lowered.includes('playwright')) {
      return new BrowserToolError('CAPABILITY_UNAVAILABLE', message, false);
    }
    return new BrowserToolError('UNKNOWN', message, true);
  }

  return new BrowserToolError('UNKNOWN', String(error), true);
}
