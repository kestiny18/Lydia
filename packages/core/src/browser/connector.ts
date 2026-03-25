import { platform } from 'node:os';
import { spawn } from 'node:child_process';
import type { Browser } from 'playwright';
import { chromium } from 'playwright';
import type { BrowserDriverMode, ResolvedBrowserDriverMode } from './manager.js';

export interface BrowserConnectorConfig {
  mode: BrowserDriverMode;
  cdpPort: number;
  remoteUrl: string;
  chromePath: string;
  launchHostBrowser: boolean;
}

export interface BrowserConnectorResult {
  browser: Browser;
  resolvedMode: ResolvedBrowserDriverMode;
}

/** Checks if the Chrome DevTools Protocol endpoint is reachable. */
async function isCdpReachable(baseUrl: string, timeoutMs = 1500): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${baseUrl}/json/version`, { signal: controller.signal });
      return response.ok;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class BrowserConnector {
  private browser: Browser | null = null;
  private resolvedMode: ResolvedBrowserDriverMode | null = null;
  private attemptedHostLaunch = false;
  private readonly config: BrowserConnectorConfig;

  constructor(config: BrowserConnectorConfig) {
    this.config = config;
  }

  getResolvedMode(): ResolvedBrowserDriverMode | null {
    return this.resolvedMode;
  }

  /** Returns the current browser instance, establishing one if needed.
   *  Follows the configured fallback chain: CDP → Remote → Headless (in auto mode). */
  async ensureBrowser(): Promise<Browser> {
    if (this.browser) return this.browser;

    const desired = this.config.mode;
    if (desired !== 'auto') {
      this.browser = await this.resolveMode(desired);
      this.resolvedMode = desired;
      return this.browser;
    }

    // Auto mode: try CDP, then remote, then headless — log each failure.
    try {
      this.browser = await this.connectCdp();
      this.resolvedMode = 'cdp';
      return this.browser;
    } catch (err) {
      console.warn('[BrowserConnector] CDP auto-connect failed:', err instanceof Error ? err.message : String(err));
    }

    if (this.config.remoteUrl) {
      try {
        this.browser = await this.connectRemote();
        this.resolvedMode = 'remote';
        return this.browser;
      } catch (err) {
        console.warn('[BrowserConnector] Remote browser auto-connect failed, falling back to headless:', err instanceof Error ? err.message : String(err));
      }
    }

    this.browser = await this.connectHeadless();
    this.resolvedMode = 'headless';
    return this.browser;
  }

  private async resolveMode(mode: Exclude<BrowserDriverMode, 'auto'>): Promise<Browser> {
    switch (mode) {
      case 'cdp':
        return this.connectCdp();
      case 'remote':
        return this.connectRemote();
      case 'headless':
        return this.connectHeadless();
    }
  }

  private async connectCdp(): Promise<Browser> {
    const url = `http://127.0.0.1:${this.config.cdpPort}`;
    let reachable = await isCdpReachable(url);

    if (!reachable && this.config.launchHostBrowser && !this.attemptedHostLaunch) {
      console.warn(`[BrowserConnector] CDP not reachable at ${url}, launching host Chrome...`);
      this.launchHostChrome();
      this.attemptedHostLaunch = true;
      await sleep(1500);
      reachable = await isCdpReachable(url);
    }

    if (!reachable) {
      throw new Error(`CDP endpoint ${url} is not reachable.`);
    }

    console.warn(`[BrowserConnector] Connected to CDP browser at ${url}`);
    return chromium.connectOverCDP(url);
  }

  private async connectRemote(): Promise<Browser> {
    if (!this.config.remoteUrl) {
      throw new Error('Remote browser URL is not configured.');
    }
    return chromium.connectOverCDP(this.config.remoteUrl);
  }

  private async connectHeadless(): Promise<Browser> {
    console.warn('[BrowserConnector] Launching headless Chromium');
    return chromium.launch({
      headless: true,
      args: ['--disable-dev-shm-usage', '--no-sandbox'],
    });
  }

  private launchHostChrome(): void {
    const binary = this.resolveChromeBinary();
    if (!binary) {
      throw new Error('CDP launch requested but no Chrome executable could be resolved.');
    }

    const userDataDir = '.lydia-artifacts/chrome-profile';
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

  /** Check whether the current browser instance is still alive. */
  isHealthy(): boolean {
    if (!this.browser) return true; // Not yet connected — not unhealthy.
    try {
      // Playwright's Browser is considered connected if it has contexts or is not closed.
      // Accessing browser.contexts() on a dead process throws.
      void this.browser.contexts();
      return true;
    } catch {
      return false;
    }
  }

  /** Closes the browser and resets all state. */
  async close(): Promise<void> {
    this.attemptedHostLaunch = false;
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    this.resolvedMode = null;
  }
}
