import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import type { SkillRegistry } from './registry.js';
import type { SkillLoader } from './loader.js';

interface SkillWatcherEvents {
  'skill:added': [{ name: string; path: string }];
  'skill:updated': [{ name: string; path: string }];
  'skill:removed': [{ name: string; path: string }];
  'error': [Error];
}

export class SkillWatcher extends EventEmitter {
  private watchers: fs.FSWatcher[] = [];
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private debounceMs: number;
  /** Map of file path -> skill name for tracking deletions */
  private pathToName: Map<string, string> = new Map();
  private running = false;

  constructor(
    private directories: string[],
    private registry: SkillRegistry,
    private loader: SkillLoader,
    options?: { debounceMs?: number },
  ) {
    super();
    this.debounceMs = options?.debounceMs ?? 300;

    // Build initial path-to-name mapping from registry
    for (const skill of this.registry.list()) {
      if (skill.path) {
        this.pathToName.set(path.resolve(skill.path), skill.name);
      }
    }
  }

  /**
   * Start watching all skill directories for changes.
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    for (const dir of this.directories) {
      this.watchDirectory(dir);
    }
  }

  /**
   * Stop all file watchers and clean up timers.
   */
  stop(): void {
    this.running = false;

    for (const watcher of this.watchers) {
      try {
        watcher.close();
      } catch (_) {
        // Ignore close errors
      }
    }
    this.watchers = [];

    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  private watchDirectory(dirPath: string): void {
    try {
      // Check if directory exists synchronously
      if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
        return;
      }

      // fs.watch with recursive: true is supported on Windows and macOS.
      // On Linux, recursive is only supported since Node 19.1.0 with inotify.
      const watcher = fs.watch(dirPath, { recursive: true }, (eventType, filename) => {
        if (!filename) return;

        const fullPath = path.resolve(dirPath, filename);

        // Only care about .md files
        if (!filename.endsWith('.md')) return;

        this.handleFileChange(fullPath, eventType);
      });

      watcher.on('error', (error) => {
        this.emit('error', error);
      });

      this.watchers.push(watcher);
    } catch (error) {
      // Directory might not exist yet — that's fine
    }
  }

  private handleFileChange(filePath: string, _eventType: string): void {
    const resolvedPath = path.resolve(filePath);

    // Debounce: if a timer already exists for this path, clear it
    const existingTimer = this.debounceTimers.get(resolvedPath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set a new debounced handler
    const timer = setTimeout(async () => {
      this.debounceTimers.delete(resolvedPath);
      await this.processFileChange(resolvedPath);
    }, this.debounceMs);

    this.debounceTimers.set(resolvedPath, timer);
  }

  private async processFileChange(filePath: string): Promise<void> {
    try {
      // Check if file still exists (might have been deleted)
      let exists = false;
      try {
        await fsPromises.access(filePath);
        exists = true;
      } catch {
        exists = false;
      }

      if (exists) {
        // File was added or modified — reload metadata
        const previousName = this.pathToName.get(filePath);
        const meta = await this.loader.reloadSkillMeta(filePath);

        if (meta) {
          this.pathToName.set(filePath, meta.name);

          if (previousName) {
            this.emit('skill:updated', { name: meta.name, path: filePath });
          } else {
            this.emit('skill:added', { name: meta.name, path: filePath });
          }
        }
      } else {
        // File was deleted — unregister skill
        const skillName = this.pathToName.get(filePath);
        if (skillName) {
          this.registry.unregister(skillName);
          this.pathToName.delete(filePath);
          this.emit('skill:removed', { name: skillName, path: filePath });
        }
      }
    } catch (error) {
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
    }
  }
}
