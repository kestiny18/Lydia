#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { Agent, AnthropicProvider, OpenAIProvider, OllamaProvider, MockProvider, FallbackProvider, ReplayManager, StrategyRegistry, ConfigLoader, MemoryManager, StrategyUpdateGate, ReplayLLMProvider, ReplayMcpClientManager } from '@lydia/core';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import open from 'open';
import { createServer } from './server/index.js';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function getVersion() {
  try {
    const pkg = JSON.parse(await readFile(join(__dirname, '../package.json'), 'utf-8'));
    return pkg.version;
  } catch (e) {
    return 'unknown';
  }
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
    .action(async (taskDescription, options) => {
      const config = await new ConfigLoader().load();
      const providerChoice = options.provider || config.llm?.provider || 'auto';
      const fallbackOrder = Array.isArray(config.llm?.fallbackOrder) && config.llm?.fallbackOrder.length > 0
        ? config.llm.fallbackOrder
        : ['ollama', 'openai', 'anthropic'];

      console.log(chalk.bold.blue('\nLydia is starting...\n'));

      const spinner = ora('Initializing Agent...').start();

      try {
        let llm;
        const createProvider = (name, strict) => {
          if (name === 'mock') {
            return new MockProvider();
          }
          if (name === 'ollama') {
            return new OllamaProvider({
              defaultModel: options.model || config.llm?.defaultModel || undefined
            });
          }
          if (name === 'openai') {
            if (!process.env.OPENAI_API_KEY) {
              if (strict) {
                console.error(chalk.red('Error: OPENAI_API_KEY is not set.'));
                console.error('Please set it in your .env file or environment variables.');
                process.exit(1);
              }
              console.warn(chalk.yellow('Skipping OpenAI: OPENAI_API_KEY is not set.'));
              return null;
            }
            return new OpenAIProvider({
              defaultModel: options.model || config.llm?.defaultModel || undefined
            });
          }
          if (name === 'anthropic') {
            if (!process.env.ANTHROPIC_API_KEY) {
              if (strict) {
                console.error(chalk.red('Error: ANTHROPIC_API_KEY is not set.'));
                console.error('Please set it in your .env file or environment variables.');
                process.exit(1);
              }
              console.warn(chalk.yellow('Skipping Anthropic: ANTHROPIC_API_KEY is not set.'));
              return null;
            }
            return new AnthropicProvider({
              defaultModel: options.model || config.llm?.defaultModel || undefined
            });
          }
          if (strict) {
            console.error(chalk.red(`Error: Unknown provider ${name}.`));
            process.exit(1);
          }
          console.warn(chalk.yellow(`Skipping unknown provider: ${name}.`));
          return null;
        };

        if (providerChoice === 'auto') {
          const providers = fallbackOrder.map((name) => createProvider(name, false)).filter(Boolean);
          if (providers.length === 0) {
            console.error(chalk.red('No available providers from fallbackOrder.'));
            process.exit(1);
          }
          llm = providers.length === 1 ? providers[0] : new FallbackProvider(providers);
        } else {
          const provider = createProvider(providerChoice, true);
          if (!provider) {
            process.exit(1);
          }
          llm = provider;
        }

        const agent = new Agent(llm);

        // --- Event Listeners for UI ---

        agent.on('task:start', (task) => {
          spinner.succeed(chalk.green('Agent initialized'));
          console.log(chalk.bold(`\nTask: ${task.description}\n`));
          spinner.start('Analyzing intent...');
        });

        agent.on('intent', (intent) => {
          spinner.succeed(chalk.blue('Intent Analyzed'));
          console.log(chalk.gray(`   Category: ${intent.category}`));
          console.log(chalk.gray(`   Summary:  ${intent.summary}`));
          spinner.start('Planning steps...');
        });

        agent.on('plan', (steps) => {
          spinner.succeed(chalk.blue('Plan Generated'));
          console.log(chalk.bold('\nExecution Plan:'));
          steps.forEach((s: any, i: number) => {
             const icon = s.type === 'action' ? '*' : '-';
             console.log(`   ${i+1}. ${icon} ${s.description}`);
          });
          console.log(''); // newline
          spinner.start('Executing...');
        });

        agent.on('step:start', (step) => {
          spinner.text = `Executing step: ${step.description}`;
        });

        agent.on('step:complete', (step) => {
          spinner.stopAndPersist({
            symbol: 'OK',
            text: `${step.description}`
          });

          if (step.result) {
            // Indent result
            const resultLines = step.result.split('\n');
            const preview = resultLines.slice(0, 5).join('\n');
            console.log(chalk.dim(preview.replace(/^/gm, '      ')));
            if (resultLines.length > 5) {
                console.log(chalk.dim(`      ... (${resultLines.length - 5} more lines)`));
            }
          }
          spinner.start('Thinking...');
        });

        // --- Interaction Handler ---
        agent.on('interaction_request', async (request) => {
          // 1. Stop the current spinner so it doesn't conflict with input
          spinner.stopAndPersist({ symbol: '!', text: 'User Input Required' });

          // 2. Prompt user
          const rl = readline.createInterface({ input, output });

          console.log(chalk.yellow(`\nAgent asks: ${request.prompt}`));
          const answer = await rl.question(chalk.bold('> '));
          rl.close();

          // 3. Resume Agent
          agent.resolveInteraction(request.id, answer);

          // 4. Restart spinner for next steps
          spinner.start('Resuming execution...');
        });


        agent.on('task:complete', () => {
          spinner.succeed(chalk.bold.green('Task Completed Successfully.'));
        });

        agent.on('task:error', (error) => {
          spinner.fail(chalk.red('Task Failed'));
          console.error(chalk.red(`\nError details: ${error.message}`));
        });

        // --- Execute ---
        await agent.run(taskDescription);

      } catch (error: any) {
        spinner.fail(chalk.red('Fatal Error'));
        console.error(error);
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
        const gate = StrategyUpdateGate.validate(strategy);
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
          } catch {}
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

  program.parse();
}

main();
