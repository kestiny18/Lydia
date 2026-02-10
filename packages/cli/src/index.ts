#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { Agent, ReplayManager, StrategyRegistry, StrategyReviewer, ConfigLoader, MemoryManager, BasicStrategyGate, StrategyUpdateGate, ReplayLLMProvider, ReplayMcpClientManager } from '@lydia/core';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import open from 'open';
import { createServer } from './server/index.js';
import { ensureServer, apiGet, apiPost, connectTaskStream } from './client.js';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import { reviewCommand } from './commands/review.js';


const __dirname = dirname(fileURLToPath(import.meta.url));

async function getVersion() {
  try {
    const pkg = JSON.parse(await readFile(join(__dirname, '../package.json'), 'utf-8'));
    return pkg.version;
  } catch (e) {
    return 'unknown';
  }
}

function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainSeconds = seconds % 60;
  return `${minutes}m ${remainSeconds}s`;
}

function bumpPatchVersion(version: string): string {
  const parts = version.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 3 || parts.some((p) => Number.isNaN(p))) {
    return `${version}-next`;
  }
  parts[2] += 1;
  return parts.join('.');
}

async function main() {
  const program = new Command();
  const version = await getVersion();

  program
    .name('lydia')
    .description('Lydia - AI Agent with Strategic Evolution')
    .version(version);

  program
    .command('run')
    .description('Execute a task')
    .argument('<task>', 'The task description')
    .option('-m, --model <model>', 'Override default model')
    .option('-p, --provider <provider>', 'LLM provider (anthropic|openai|ollama|mock|auto)')
    .option('--port <number>', 'Server port', '3000')
    .action(async (taskDescription, options) => {
      console.log(chalk.bold.blue('\nLydia is starting...\n'));

      const spinner = ora('Connecting to server...').start();

      try {
        // 1. Ensure server is running (auto-start if needed)
        const port = await ensureServer(parseInt(options.port, 10));
        spinner.succeed(chalk.green('Server connected'));

        // 2. Submit task to server
        spinner.start('Submitting task...');
        const { runId } = await apiPost<{ runId: string }>('/api/tasks/run', { input: taskDescription }, port);
        spinner.succeed(chalk.green(`Task submitted (${runId})`));
        console.log(chalk.bold(`\nTask: ${taskDescription}\n`));
        spinner.start('Thinking...');

        // 3. Stream results via WebSocket
        let isStreaming = false;

        await new Promise<void>((resolve, reject) => {
          connectTaskStream(runId, {
            onText(text) {
              if (!isStreaming) {
                spinner.stop();
                isStreaming = true;
              }
              process.stdout.write(chalk.white(text));
            },
            onThinking() {
              if (!isStreaming) {
                spinner.stop();
                isStreaming = true;
              }
              spinner.text = chalk.dim('Thinking...');
            },
            onToolStart(name) {
              if (isStreaming) {
                process.stdout.write('\n');
                isStreaming = false;
              }
              spinner.start(`Using tool: ${name}`);
            },
            onToolComplete(name, duration, result) {
              spinner.stopAndPersist({
                symbol: chalk.green('*'),
                text: `${chalk.green(name)} ${chalk.dim(`(${duration}ms)`)}`
              });
              if (result) {
                const resultLines = String(result).split('\n');
                const preview = resultLines.slice(0, 5).join('\n');
                console.log(chalk.dim(preview.replace(/^/gm, '      ')));
                if (resultLines.length > 5) {
                  console.log(chalk.dim(`      ... (${resultLines.length - 5} more lines)`));
                }
              }
              spinner.start('Thinking...');
            },
            onToolError(name, error) {
              spinner.stopAndPersist({
                symbol: chalk.red('x'),
                text: `${chalk.red(name)}: ${error}`
              });
              spinner.start('Thinking...');
            },
            onRetry(attempt, maxRetries, delay, error) {
              spinner.text = chalk.yellow(`Retry ${attempt}/${maxRetries} after ${delay}ms: ${error}`);
            },
            async onInteraction(_id, prompt) {
              if (isStreaming) {
                process.stdout.write('\n');
                isStreaming = false;
              }
              spinner.stopAndPersist({ symbol: '!', text: 'User Input Required' });

              const rl = readline.createInterface({ input, output });
              console.log(chalk.yellow(`\nAgent asks: ${prompt}`));
              const answer = await rl.question(chalk.bold('> '));
              rl.close();

              spinner.start('Resuming...');
              return answer;
            },
            onComplete(_taskId, _result) {
              if (isStreaming) {
                process.stdout.write('\n');
                isStreaming = false;
              }
              spinner.succeed(chalk.bold.green('Task Completed.'));
              resolve();
            },
            onError(error) {
              if (isStreaming) {
                process.stdout.write('\n');
                isStreaming = false;
              }
              spinner.fail(chalk.red('Task Failed'));
              console.error(chalk.red(`\nError details: ${error}`));
              resolve(); // resolve, not reject — error is expected
            },
            onMessage(type, _data) {
              if (type === 'message' && _data?.text) {
                spinner.stop();
                console.log(chalk.white(_data.text));
                spinner.start('Thinking...');
              }
            },
          }, port).catch(reject);
        });

      } catch (error: any) {
        spinner.fail(chalk.red('Fatal Error'));
        console.error(chalk.red(error.message || error));
        process.exit(1);
      }
    });

  // ─── Chat Command (via Server API) ─────────────────────────────────

  program
    .command('chat')
    .description('Start an interactive chat session with Lydia')
    .option('--port <number>', 'Server port', '3000')
    .action(async (options) => {
      console.log(chalk.bold.blue('\nLydia Chat Mode\n'));
      console.log(chalk.dim('Commands: /exit, /reset, /tasks, /task <id>, /help'));
      console.log(chalk.dim('\u2500'.repeat(40) + '\n'));

      try {
        // 1. Ensure server is running
        const port = await ensureServer(parseInt(options.port, 10));

        // 2. Start a chat session via server API
        let sessionId = (await apiPost<{ sessionId: string }>('/api/chat/start', {}, port)).sessionId;

        // 3. REPL loop
        const rl = readline.createInterface({ input, output });

        while (true) {
          const userInput = await rl.question(chalk.bold.cyan('You> '));
          const trimmed = userInput.trim();

          if (!trimmed) continue;

          if (trimmed === '/exit' || trimmed === '/quit') {
            // Clean up server session
            await apiPost(`/api/chat/${sessionId}`, undefined, port).catch(() => {});
            console.log(chalk.dim('\nGoodbye!'));
            rl.close();
            break;
          }

          if (trimmed === '/reset') {
            // Delete old session, start new one
            await fetch(`http://localhost:${port}/api/chat/${sessionId}`, { method: 'DELETE' }).catch(() => {});
            sessionId = (await apiPost<{ sessionId: string }>('/api/chat/start', {}, port)).sessionId;
            console.log(chalk.dim('Session reset.\n'));
            continue;
          }

          if (trimmed === '/help') {
            console.log(chalk.dim('  /exit      - End the chat session'));
            console.log(chalk.dim('  /reset     - Clear conversation history'));
            console.log(chalk.dim('  /tasks     - List recent task history'));
            console.log(chalk.dim('  /task <id> - Show task detail'));
            console.log(chalk.dim('  /help      - Show this help message\n'));
            continue;
          }

          if (trimmed === '/tasks') {
            try {
              const result = await apiGet<{ items: any[] }>('/api/tasks?limit=10', port);
              if (!result.items?.length) {
                console.log(chalk.dim('No tasks found.\n'));
              } else {
                console.log(chalk.bold('\nRecent Tasks:'));
                for (const item of result.items) {
                  const icon = item.status === 'completed' ? chalk.green('\u2713')
                    : item.status === 'running' ? chalk.blue('\u25CB')
                      : chalk.red('\u2717');
                  const date = new Date(item.createdAt).toLocaleString();
                  console.log(`  ${icon} ${item.input?.substring(0, 60) || 'Unknown'} ${chalk.dim(`\u00B7 ${date} \u00B7 ${item.id}`)}`);
                }
                console.log('');
              }
            } catch (err: any) {
              console.log(chalk.red(`Failed to fetch tasks: ${err.message}\n`));
            }
            continue;
          }

          if (trimmed.startsWith('/task ')) {
            const taskId = trimmed.slice('/task '.length).trim();
            try {
              const detail = await apiGet<any>(`/api/tasks/${encodeURIComponent(taskId)}/detail`, port);
              const statusText = detail.status === 'completed' ? chalk.green('SUCCESS')
                : detail.status === 'running' ? chalk.blue('RUNNING')
                  : chalk.red('FAILED');
              console.log(chalk.bold(`\n${detail.report?.intentSummary || detail.input || 'Task'}`));
              console.log(`  Status: ${statusText} \u00B7 ${new Date(detail.createdAt).toLocaleString()}`);
              if (detail.report?.summary) console.log(`  ${detail.report.summary}`);
              if (detail.report?.outputs?.length) {
                for (const out of detail.report.outputs) console.log(`  \u2192 ${out}`);
              }
              console.log('');
            } catch (err: any) {
              console.log(chalk.red(`Failed to fetch task: ${err.message}\n`));
            }
            continue;
          }

          // Send message to chat session
          try {
            const { response } = await apiPost<{ response: string }>(
              `/api/chat/${sessionId}/message`,
              { message: trimmed },
              port,
            );
            if (response) {
              console.log(chalk.white(response));
            }
            console.log(''); // blank line after response
          } catch (error: any) {
            console.error(chalk.red(`Error: ${error.message}\n`));
          }
        }
      } catch (error: any) {
        console.error(chalk.red('Fatal Error:'), error.message);
        process.exit(1);
      }
    });

  program
    .command('replay')
    .description('Replay a past episode')
    .argument('<episodeId>', 'The ID of the episode to replay')
    .action(async (episodeId) => {
      try {
        const id = parseInt(episodeId, 10);
        if (isNaN(id)) throw new Error('Episode ID must be a number');

        const replayer = new ReplayManager();
        await replayer.replay(id);
      } catch (error: any) {
        console.error(chalk.red('Replay Error:'), error.message);
      }
    });

  program
    .command('dashboard')
    .description('Launch the Web Dashboard')
    .option('-p, --port <number>', 'Port to run on', '3000')
    .option('--no-open', 'Do not open browser automatically')
    .action(async (options) => {
      const port = parseInt(options.port, 10);
      const server = createServer(port);
      server.start();

      const url = `http://localhost:${port}`;
      console.log(chalk.green(`\n Dashboard running at: ${chalk.bold(url)}\n`));

      if (options.open) {
        await open(url);
      }
    });

  program.addCommand(reviewCommand());

  program
    .command('init')
    .description('Initialize Lydia config, strategy, and folders')
    .action(async () => {
      const home = os.homedir();
      const baseDir = path.join(home, '.lydia');
      const strategiesDir = path.join(baseDir, 'strategies');
      const skillsDir = path.join(baseDir, 'skills');
      const configPath = path.join(baseDir, 'config.json');
      const strategyPath = path.join(strategiesDir, 'default.yml');

      try {
        await fsPromises.mkdir(strategiesDir, { recursive: true });
        await fsPromises.mkdir(skillsDir, { recursive: true });

        if (!fs.existsSync(configPath)) {
          const loader = new ConfigLoader();
          const config = await loader.load();
          await fsPromises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
          console.log(chalk.green(`Created config: ${configPath}`));
        } else {
          console.log(chalk.gray(`Config already exists: ${configPath}`));
        }

        if (!fs.existsSync(strategyPath)) {
          const content = [
            'id: default',
            'version: "1.0.0"',
            'name: Default Strategy',
            'description: Baseline strategy for safe execution.',
            'preferences:',
            '  autonomy_level: assisted',
            '  confirmation_bias: high',
            'constraints:',
            '  must_confirm:',
            '    - shell_execute',
            '    - fs_write_file',
            'evolution_limits:',
            '  max_delta: 0.1',
            '  cooldown_days: 7',
            ''
          ].join('\n');
          await fsPromises.writeFile(strategyPath, content, 'utf-8');
          console.log(chalk.green(`Created strategy: ${strategyPath}`));
        } else {
          console.log(chalk.gray(`Strategy already exists: ${strategyPath}`));
        }

        console.log(chalk.green('Lydia initialization complete.'));
      } catch (error: any) {
        console.error(chalk.red('Initialization failed:'), error.message);
      }
    });

  const strategyCmd = program
    .command('strategy')
    .description('Manage strategies');

  strategyCmd
    .command('list')
    .description('List available strategies')
    .action(async () => {
      const registry = new StrategyRegistry();
      const dir = path.join(os.homedir(), '.lydia', 'strategies');
      try {
        const strategies = await registry.listFromDirectory(dir);
        if (strategies.length === 0) {
          console.log(chalk.yellow('No strategies found.'));
          return;
        }
        strategies.forEach((s) => {
          console.log(`${chalk.green(s.id)} v${s.version} - ${s.name}`);
        });
      } catch (error: any) {
        console.error(chalk.red('Failed to list strategies:'), error.message);
      }
    });

  strategyCmd
    .command('use')
    .description('Set active strategy by file path')
    .argument('<file>', 'Path to strategy file')
    .action(async (file) => {
      const loader = new ConfigLoader();
      try {
        const absPath = path.resolve(file);
        const registry = new StrategyRegistry();
        await registry.loadFromFile(absPath);
        await loader.update({ strategy: { activePath: absPath } } as any);
        console.log(chalk.green(`Active strategy set to: ${absPath}`));
      } catch (error: any) {
        console.error(chalk.red('Failed to set active strategy:'), error.message);
      }
    });

  strategyCmd
    .command('propose')
    .description('Propose a strategy update for review')
    .argument('<file>', 'Path to strategy file')
    .action(async (file) => {
      const absPath = path.resolve(file);
      const dbPath = path.join(os.homedir(), '.lydia', 'memory.db');
      const memory = new MemoryManager(dbPath);
      const registry = new StrategyRegistry();

      try {
        const strategy = await registry.loadFromFile(absPath);
        const gate = BasicStrategyGate.validate(strategy);
        if (!gate.ok) {
          const id = memory.recordStrategyProposal({
            strategy_path: absPath,
            status: 'invalid',
            reason: gate.reason,
            created_at: Date.now(),
            decided_at: Date.now(),
          });
          console.error(chalk.red(`Proposal rejected by gate: ${id}`));
          console.error(chalk.red(gate.reason || 'Invalid strategy'));
          return;
        }

        const episodes = memory.listEpisodes(50);

        const computeMetrics = (s: any) => {
          const mustConfirm = Array.isArray(s?.constraints?.must_confirm)
            ? s.constraints.must_confirm
            : [];
          let totalTraces = 0;
          let confirmTraces = 0;
          let successTraces = 0;
          let failedTraces = 0;
          let durationTotal = 0;
          const toolCounts: Record<string, number> = {};

          for (const ep of episodes) {
            if (!ep.id) continue;
            const traces = memory.getTraces(ep.id);
            for (const t of traces) {
              totalTraces += 1;
              toolCounts[t.tool_name] = (toolCounts[t.tool_name] || 0) + 1;
              durationTotal += t.duration;
              if (t.status === 'success') successTraces += 1;
              if (t.status === 'failed') failedTraces += 1;
              if (mustConfirm.includes(t.tool_name)) {
                confirmTraces += 1;
              }
            }
          }

          return {
            traces: totalTraces,
            confirm_required: confirmTraces,
            must_confirm: mustConfirm,
            tool_usage: toolCounts,
            success: successTraces,
            failed: failedTraces,
            success_rate: totalTraces > 0 ? successTraces / totalTraces : 0,
            avg_duration_ms: totalTraces > 0 ? Math.round(durationTotal / totalTraces) : 0,
          };
        };

        let baselineMetrics = null;
        let baselineMeta: any = null;
        try {
          const baselinePath = config.strategy?.activePath;
          const baseline = baselinePath
            ? await registry.loadFromFile(baselinePath)
            : await registry.loadDefault();
          baselineMetrics = computeMetrics(baseline);
          baselineMeta = { id: baseline.id, version: baseline.version };
        } catch {
          baselineMetrics = null;
        }

        const candidateMetrics = computeMetrics(strategy);

        const evaluation = {
          episodes: episodes.length,
          baseline_strategy: baselineMeta,
          candidate_strategy: { id: strategy.id, version: strategy.version },
          baseline: baselineMetrics,
          candidate: candidateMetrics,
          delta: baselineMetrics
            ? {
              confirm_required: candidateMetrics.confirm_required - baselineMetrics.confirm_required,
              traces: candidateMetrics.traces - baselineMetrics.traces,
              success_rate: Number((candidateMetrics.success_rate - baselineMetrics.success_rate).toFixed(4)),
              avg_duration_ms: candidateMetrics.avg_duration_ms - baselineMetrics.avg_duration_ms
            }
            : null,
          replay: {
            episodes: 0,
            drift_episodes: 0,
            drift_steps: 0,
          }
        };

        const config = await new ConfigLoader().load();
        const replayCount = config.strategy?.replayEpisodes ?? 10;
        const evalEpisodes = episodes.slice(0, replayCount);
        for (const ep of evalEpisodes) {
          if (!ep.id) continue;
          const traces = memory.getTraces(ep.id);
          const mockLLM = new ReplayLLMProvider(ep.plan);
          const mockMcp = new ReplayMcpClientManager(traces);
          const agent = new Agent(mockLLM);

          const tempDb = path.join(os.tmpdir(), `lydia-replay-eval-${Date.now()}-${ep.id}.db`);
          (agent as any).mcpClientManager = mockMcp;
          (agent as any).isInitialized = true;
          (agent as any).memoryManager = new MemoryManager(tempDb);
          await (agent as any).skillLoader.loadAll();

          try {
            await agent.run(ep.input);
          } catch {
            // ignore replay execution errors for evaluation summary
          }

          evaluation.replay.episodes += 1;
          evaluation.replay.drift_steps += mockMcp.drifts.length;
          if (mockMcp.drifts.length > 0) {
            evaluation.replay.drift_episodes += 1;
          }

          try {
            fs.rmSync(tempDb, { force: true });
          } catch {
            // ignore cleanup errors
          }
        }

        const id = memory.recordStrategyProposal({
          strategy_path: absPath,
          status: 'pending_human',
          evaluation_json: JSON.stringify(evaluation),
          created_at: Date.now(),
        });
        console.log(chalk.green(`Proposal created: ${id}`));
      } catch (error: any) {
        const id = memory.recordStrategyProposal({
          strategy_path: absPath,
          status: 'invalid',
          reason: error.message,
          created_at: Date.now(),
          decided_at: Date.now(),
        });
        console.error(chalk.red(`Proposal invalid: ${id}`));
        console.error(chalk.red(error.message));
      }
    });

  strategyCmd
    .command('review')
    .description('Review recent episodes and generate a strategy proposal')
    .option('-n, --limit <limit>', 'Max episodes to review', '50')
    .option('--min-failures <count>', 'Min failures per tool', '1')
    .option('--min-failure-rate <rate>', 'Min failure rate per tool', '0.2')
    .action(async (options) => {
      const config = await new ConfigLoader().load();
      const registry = new StrategyRegistry();
      const dbPath = path.join(os.homedir(), '.lydia', 'memory.db');
      const memory = new MemoryManager(dbPath);

      try {
        const activePath = config.strategy?.activePath;
        const active = activePath
          ? await registry.loadFromFile(activePath)
          : await registry.loadDefault();

        const reviewer = new StrategyReviewer(memory);
        const summary = reviewer.review(active, {
          episodeLimit: Number(options.limit) || 50,
          minFailures: Number(options.minFailures) || 1,
          minFailureRate: Number(options.minFailureRate) || 0.2
        });

        if (summary.findings.length === 0) {
          console.log(chalk.yellow('No actionable findings.'));
          return;
        }

        const proposed = JSON.parse(JSON.stringify(active));
        proposed.metadata = {
          ...active.metadata,
          version: bumpPatchVersion(active.metadata.version),
          inheritFrom: active.metadata.id,
          description: `${active.metadata.description || 'Strategy'} (auto review)`
        };

        const existingConfirmations = new Set(active.execution?.requiresConfirmation || []);
        for (const tool of summary.suggestedConfirmations) {
          existingConfirmations.add(tool);
        }
        proposed.execution = {
          ...(active.execution || {}),
          requiresConfirmation: Array.from(existingConfirmations)
        };

        const proposalsDir = path.join(os.homedir(), '.lydia', 'strategies', 'proposals');
        await fsPromises.mkdir(proposalsDir, { recursive: true });
        const proposalPath = path.join(
          proposalsDir,
          `${proposed.metadata.id}-v${proposed.metadata.version}.yml`
        );
        await registry.saveToFile(proposed, proposalPath);

        const gate = BasicStrategyGate.validate(proposed);
        const status = gate.ok ? 'pending_human' : 'invalid';
        const id = memory.recordStrategyProposal({
          strategy_path: proposalPath,
          status,
          reason: gate.reason,
          evaluation_json: JSON.stringify({ review: summary }),
          created_at: Date.now(),
          decided_at: gate.ok ? undefined : Date.now()
        });

        if (gate.ok) {
          console.log(chalk.green(`Review proposal created: ${id}`));
          console.log(chalk.green(`Proposal file: ${proposalPath}`));
        } else {
          console.error(chalk.red(`Proposal rejected by gate: ${id}`));
          console.error(chalk.red(gate.reason || 'Invalid strategy'));
        }
      } catch (error: any) {
        console.error(chalk.red('Review failed:'), error.message);
      }
    });

  strategyCmd
    .command('approve')
    .description('Approve a strategy proposal')
    .argument('<id>', 'Proposal id')
    .action(async (id) => {
      const proposalId = Number(id);
      if (Number.isNaN(proposalId)) {
        console.error(chalk.red('Proposal id must be a number'));
        return;
      }

      const dbPath = path.join(os.homedir(), '.lydia', 'memory.db');
      const memory = new MemoryManager(dbPath);
      const proposal = memory.getStrategyProposal(proposalId);
      if (!proposal) {
        console.error(chalk.red('Proposal not found'));
        return;
      }
      if (proposal.status !== 'pending_human') {
        console.error(chalk.red(`Proposal is ${proposal.status}`));
        return;
      }

      const config = await new ConfigLoader().load();
      const cooldownDays = config.strategy?.approvalCooldownDays ?? 7;
      const dailyLimit = config.strategy?.approvalDailyLimit ?? 1;
      const now = Date.now();

      const lastApproval = memory.getFactByKey('strategy.approval.last');
      if (lastApproval?.content) {
        const lastTime = Number(lastApproval.content);
        if (!Number.isNaN(lastTime)) {
          const diffDays = (now - lastTime) / (24 * 60 * 60 * 1000);
          if (diffDays < cooldownDays) {
            console.error(chalk.red(`Approval cooldown active (${cooldownDays} days).`));
            return;
          }
        }
      }

      const dateKey = new Date(now).toISOString().slice(0, 10);
      const dailyKey = `strategy.approval.daily.${dateKey}`;
      const dailyFact = memory.getFactByKey(dailyKey);
      const dailyCount = dailyFact?.content ? Number(dailyFact.content) : 0;
      if (!Number.isNaN(dailyCount) && dailyCount >= dailyLimit) {
        console.error(chalk.red(`Daily approval limit reached (${dailyLimit}).`));
        return;
      }

      const loader = new ConfigLoader();
      await loader.update({ strategy: { activePath: proposal.strategy_path } } as any);
      memory.updateStrategyProposal(proposalId, 'approved');
      memory.rememberFact(String(now), 'strategy.approval.last', ['strategy', 'approval']);
      memory.rememberFact(String((Number.isNaN(dailyCount) ? 0 : dailyCount) + 1), dailyKey, ['strategy', 'approval']);
      console.log(chalk.green(`Approved proposal ${proposalId}`));
    });

  strategyCmd
    .command('reject')
    .description('Reject a strategy proposal')
    .argument('<id>', 'Proposal id')
    .option('-r, --reason <reason>', 'Rejection reason')
    .action(async (id, options) => {
      const proposalId = Number(id);
      if (Number.isNaN(proposalId)) {
        console.error(chalk.red('Proposal id must be a number'));
        return;
      }

      const dbPath = path.join(os.homedir(), '.lydia', 'memory.db');
      const memory = new MemoryManager(dbPath);
      const proposal = memory.getStrategyProposal(proposalId);
      if (!proposal) {
        console.error(chalk.red('Proposal not found'));
        return;
      }
      if (proposal.status !== 'pending_human') {
        console.error(chalk.red(`Proposal is ${proposal.status}`));
        return;
      }

      memory.updateStrategyProposal(proposalId, 'rejected', options.reason);
      console.log(chalk.yellow(`Rejected proposal ${proposalId}`));
    });

  strategyCmd
    .command('proposals')
    .description('List recent strategy proposals')
    .option('-n, --limit <limit>', 'Max number of proposals', '20')
    .action(async (options) => {
      const limit = Number(options.limit) || 20;
      const dbPath = path.join(os.homedir(), '.lydia', 'memory.db');
      const memory = new MemoryManager(dbPath);
      const proposals = memory.listStrategyProposals(limit);
      if (proposals.length === 0) {
        console.log(chalk.yellow('No proposals found.'));
        return;
      }
      proposals.forEach((p) => {
        let delta = '';
        if (p.evaluation_json) {
          try {
            const evalData = JSON.parse(p.evaluation_json);
            if (evalData?.delta?.confirm_required !== undefined) {
              delta = ` | delta_confirm: ${evalData.delta.confirm_required}`;
            }
          } catch { }
        }
        const summary = p.evaluation_json ? 'has_eval' : 'no_eval';
        console.log(`${p.id} | ${p.status} | ${summary}${delta} | ${p.strategy_path}`);
      });
    });

  strategyCmd
    .command('report')
    .description('Export proposal evaluation to a JSON file')
    .argument('<id>', 'Proposal id')
    .argument('<file>', 'Output file path')
    .action(async (id, file) => {
      const proposalId = Number(id);
      if (Number.isNaN(proposalId)) {
        console.error(chalk.red('Proposal id must be a number'));
        return;
      }
      const dbPath = path.join(os.homedir(), '.lydia', 'memory.db');
      const memory = new MemoryManager(dbPath);
      const proposal = memory.getStrategyProposal(proposalId);
      if (!proposal || !proposal.evaluation_json) {
        console.error(chalk.red('Proposal evaluation not found'));
        return;
      }
      const outPath = path.resolve(file);
      fs.writeFileSync(outPath, proposal.evaluation_json, 'utf-8');
      console.log(chalk.green(`Report saved: ${outPath}`));
    });

  // ─── Tasks Command Group (via Server API) ────────────────────────

  const tasksCmd = program
    .command('tasks')
    .description('View and manage task history');

  tasksCmd
    .command('list')
    .description('List recent tasks')
    .option('-n, --limit <limit>', 'Max number of tasks', '20')
    .option('--status <status>', 'Filter by status (running|completed|failed)')
    .option('-s, --search <query>', 'Search tasks by keyword')
    .option('--port <number>', 'Server port', '3000')
    .action(async (options) => {
      try {
        const port = await ensureServer(parseInt(options.port, 10));
        const limit = Number(options.limit) || 20;
        const params = new URLSearchParams({ limit: String(limit) });
        if (options.status) params.set('status', options.status);
        if (options.search) params.set('search', options.search);

        const result = await apiGet<{ items: any[]; total: number; activeRunId: string | null }>(
          `/api/tasks?${params}`, port
        );

        if (!result.items?.length) {
          console.log(chalk.yellow('No tasks found.'));
          return;
        }

        console.log(chalk.bold(`\nRecent Tasks (${result.items.length} of ${result.total}):\n`));

        for (const item of result.items) {
          const statusIcon = item.status === 'completed' ? chalk.green('\u2713')
            : item.status === 'running' ? chalk.blue('\u25CB')
              : chalk.red('\u2717');
          const statusText = item.status === 'completed' ? chalk.green('completed')
            : item.status === 'running' ? chalk.blue('running')
              : chalk.red('failed');
          const title = item.input?.substring(0, 80) || item.summary || 'Unknown task';
          const date = new Date(item.createdAt).toLocaleString();
          const duration = item.duration ? ` (${formatDurationMs(item.duration)})` : '';

          console.log(`  ${statusIcon} ${chalk.bold(title)}`);
          console.log(`    ${statusText}${duration} \u00B7 ${chalk.dim(date)} \u00B7 ID: ${chalk.dim(item.id)}`);
          if (item.summary && item.summary !== item.input) {
            console.log(`    ${chalk.dim(item.summary.substring(0, 100))}`);
          }
          console.log('');
        }
      } catch (error: any) {
        console.error(chalk.red('Failed to list tasks:'), error.message);
      }
    });

  tasksCmd
    .command('show')
    .description('Show detailed information about a task')
    .argument('<id>', 'Task ID (e.g., report-5 or run-...)')
    .option('--port <number>', 'Server port', '3000')
    .action(async (id, options) => {
      try {
        const port = await ensureServer(parseInt(options.port, 10));
        const detail = await apiGet<any>(`/api/tasks/${encodeURIComponent(id)}/detail`, port);

        const statusText = detail.status === 'completed' ? chalk.green('SUCCESS')
          : detail.status === 'running' ? chalk.blue('RUNNING')
            : chalk.red('FAILED');
        const title = detail.report?.intentSummary || detail.input || 'Unknown task';
        const date = new Date(detail.createdAt).toLocaleString();
        const duration = detail.duration ? formatDurationMs(detail.duration) : 'N/A';

        console.log(chalk.bold(`\nTask: ${title}\n`));
        console.log(`  Status:   ${statusText}`);
        console.log(`  Date:     ${date}`);
        console.log(`  Duration: ${duration}`);
        console.log(`  ID:       ${id}`);

        if (detail.report?.summary) {
          console.log(`\n  ${chalk.bold('Summary:')}`);
          console.log(`  ${detail.report.summary}`);
        }

        if (detail.report?.outputs?.length) {
          console.log(`\n  ${chalk.bold('Outputs:')}`);
          for (const out of detail.report.outputs) {
            console.log(`  \u2192 ${out}`);
          }
        }

        if (detail.report?.steps?.length) {
          console.log(`\n  ${chalk.bold('Steps:')}`);
          for (const step of detail.report.steps) {
            const stepIcon = step.status === 'completed' ? chalk.green('\u2713') : chalk.red('\u2717');
            console.log(`  ${stepIcon} ${step.stepId} (${step.status})`);
          }
        }

        if (detail.report?.followUps?.length) {
          console.log(`\n  ${chalk.bold('Follow-ups:')}`);
          for (const item of detail.report.followUps) {
            console.log(`  \u2022 ${item}`);
          }
        }

        if (detail.traces?.length) {
          console.log(`\n  ${chalk.bold(`Tool Traces (${detail.traces.length} steps):`)}`);
          for (const trace of detail.traces) {
            const traceIcon = trace.status === 'success' ? chalk.green('\u2713') : chalk.red('\u2717');
            console.log(`  ${traceIcon} ${trace.tool_name} ${chalk.dim(`(${trace.duration}ms)`)}`);
          }
        }

        console.log('');
      } catch (error: any) {
        console.error(chalk.red('Failed to show task:'), error.message);
      }
    });

  // ─── Skills Command Group ─────────────────────────────────────────

  const skillsCmd = program
    .command('skills')
    .description('Manage skills');

  skillsCmd
    .command('list')
    .description('List all loaded skills')
    .action(async () => {
      const { SkillRegistry, SkillLoader } = await import('@lydia/core');
      const registry = new SkillRegistry();
      const loader = new SkillLoader(registry);
      const config = await new ConfigLoader().load();
      const extraDirs = config.skills?.extraDirs ?? [];
      await loader.loadAll(extraDirs);

      const skills = registry.list();
      if (skills.length === 0) {
        console.log(chalk.yellow('No skills found.'));
        return;
      }

      console.log(chalk.bold(`\nLoaded Skills (${skills.length}):\n`));
      for (const skill of skills) {
        const version = ('version' in skill && skill.version) ? ` v${skill.version}` : '';
        const tags = skill.tags?.length ? chalk.dim(` [${skill.tags.join(', ')}]`) : '';
        const source = skill.path ? chalk.dim(` (${skill.path})`) : '';
        const isDynamic = 'execute' in skill ? chalk.cyan(' [dynamic]') : '';
        console.log(`  ${chalk.green(skill.name)}${version}${isDynamic} - ${skill.description}${tags}`);
        if (source) console.log(`    ${source}`);
      }
      console.log('');
    });

  skillsCmd
    .command('info')
    .description('Show detailed information about a skill')
    .argument('<name>', 'Skill name')
    .action(async (name) => {
      const { SkillRegistry, SkillLoader } = await import('@lydia/core');
      const registry = new SkillRegistry();
      const loader = new SkillLoader(registry);
      const config = await new ConfigLoader().load();
      const extraDirs = config.skills?.extraDirs ?? [];
      await loader.loadAll(extraDirs);

      const skill = registry.get(name);
      if (!skill) {
        console.error(chalk.red(`Skill "${name}" not found.`));
        return;
      }

      console.log(chalk.bold(`\nSkill: ${skill.name}\n`));
      console.log(`  Description: ${skill.description}`);
      if ('version' in skill && skill.version) console.log(`  Version:     ${skill.version}`);
      if ('author' in skill && skill.author) console.log(`  Author:      ${skill.author}`);
      if (skill.tags?.length) console.log(`  Tags:        ${skill.tags.join(', ')}`);
      if (skill.allowedTools?.length) console.log(`  Allowed Tools: ${skill.allowedTools.join(', ')}`);
      if (skill.path) console.log(`  Path:        ${skill.path}`);

      // Load and show content
      const content = await loader.loadContent(name);
      if (content) {
        console.log(chalk.dim(`\n${'─'.repeat(40)}\n`));
        console.log(content);
        console.log('');
      }
    });

  skillsCmd
    .command('install')
    .description('Install a skill from a GitHub URL or local path')
    .argument('<source>', 'GitHub URL (github:user/repo/path) or local directory path')
    .option('--project', 'Install to project .lydia/skills/ instead of user global')
    .action(async (source, options) => {
      const targetDir = options.project
        ? path.join(process.cwd(), '.lydia', 'skills')
        : path.join(os.homedir(), '.lydia', 'skills');

      await fsPromises.mkdir(targetDir, { recursive: true });

      if (source.startsWith('github:')) {
        // Parse GitHub source: github:user/repo/path/to/skill
        const ghPath = source.slice('github:'.length);
        const parts = ghPath.split('/');
        if (parts.length < 3) {
          console.error(chalk.red('Invalid GitHub source. Format: github:owner/repo/path/to/skill'));
          return;
        }

        const owner = parts[0];
        const repo = parts[1];
        const skillPath = parts.slice(2).join('/');
        const skillName = parts[parts.length - 1].replace(/\.md$/, '');

        console.log(chalk.dim(`Fetching from GitHub: ${owner}/${repo}/${skillPath}...`));

        try {
          // Try to fetch as a single file first
          const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/${skillPath}`;
          const response = await fetch(rawUrl);

          if (response.ok) {
            const content = await response.text();
            const fileName = skillPath.endsWith('.md') ? path.basename(skillPath) : `${skillName}.md`;
            const destPath = path.join(targetDir, fileName);
            await fsPromises.writeFile(destPath, content, 'utf-8');
            console.log(chalk.green(`Installed skill to: ${destPath}`));
          } else {
            // Try fetching as directory via GitHub API (contents endpoint)
            const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${skillPath}`;
            const apiResponse = await fetch(apiUrl, {
              headers: { 'Accept': 'application/vnd.github.v3+json' }
            });

            if (!apiResponse.ok) {
              console.error(chalk.red(`Failed to fetch from GitHub: ${apiResponse.statusText}`));
              return;
            }

            const contents = await apiResponse.json() as any[];
            if (!Array.isArray(contents)) {
              console.error(chalk.red('Source is not a valid file or directory.'));
              return;
            }

            // Download each file in the directory
            const skillDir = path.join(targetDir, skillName);
            await fsPromises.mkdir(skillDir, { recursive: true });

            for (const item of contents) {
              if (item.type === 'file' && item.download_url) {
                const fileRes = await fetch(item.download_url);
                if (fileRes.ok) {
                  const fileContent = await fileRes.text();
                  const fileDest = path.join(skillDir, item.name);
                  await fsPromises.writeFile(fileDest, fileContent, 'utf-8');
                  console.log(chalk.dim(`  Downloaded: ${item.name}`));
                }
              }
            }
            console.log(chalk.green(`Installed skill directory to: ${skillDir}`));
          }
        } catch (error: any) {
          console.error(chalk.red(`Installation failed: ${error.message}`));
        }
      } else {
        // Local path installation: copy file or directory
        const sourcePath = path.resolve(source);
        try {
          const stat = await fsPromises.stat(sourcePath);
          if (stat.isFile()) {
            const destPath = path.join(targetDir, path.basename(sourcePath));
            await fsPromises.copyFile(sourcePath, destPath);
            console.log(chalk.green(`Installed skill to: ${destPath}`));
          } else if (stat.isDirectory()) {
            const dirName = path.basename(sourcePath);
            const destDir = path.join(targetDir, dirName);
            await fsPromises.mkdir(destDir, { recursive: true });
            // Recursively copy directory
            await copyDir(sourcePath, destDir);
            console.log(chalk.green(`Installed skill directory to: ${destDir}`));
          }
        } catch (error: any) {
          console.error(chalk.red(`Installation failed: ${error.message}`));
        }
      }
    });

  skillsCmd
    .command('remove')
    .description('Remove an installed skill')
    .argument('<name>', 'Skill name to remove')
    .option('--project', 'Remove from project .lydia/skills/ instead of user global')
    .action(async (name, options) => {
      const baseDir = options.project
        ? path.join(process.cwd(), '.lydia', 'skills')
        : path.join(os.homedir(), '.lydia', 'skills');

      // Try to find and remove the skill file/directory
      let removed = false;

      // Check for direct .md file
      const mdPath = path.join(baseDir, `${name}.md`);
      if (fs.existsSync(mdPath)) {
        await fsPromises.unlink(mdPath);
        console.log(chalk.green(`Removed skill file: ${mdPath}`));
        removed = true;
      }

      // Check for directory with SKILL.md
      const dirPath = path.join(baseDir, name);
      if (fs.existsSync(dirPath)) {
        await fsPromises.rm(dirPath, { recursive: true });
        console.log(chalk.green(`Removed skill directory: ${dirPath}`));
        removed = true;
      }

      if (!removed) {
        console.error(chalk.red(`Skill "${name}" not found in ${baseDir}`));
      }
    });

  program.parse();
}

/** Recursively copy a directory */
async function copyDir(src: string, dest: string) {
  const entries = await fsPromises.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await fsPromises.mkdir(destPath, { recursive: true });
      await copyDir(srcPath, destPath);
    } else {
      await fsPromises.copyFile(srcPath, destPath);
    }
  }
}

main();
