#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { Agent, AnthropicProvider, ReplayManager, StrategyRegistry, ConfigLoader, MemoryManager, StrategyUpdateGate } from '@lydia/core';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import open from 'open';
import { createServer } from './server/index.js';
import * as os from 'node:os';
import * as path from 'node:path';

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
    .action(async (taskDescription, options) => {
      // check api key
      if (!process.env.ANTHROPIC_API_KEY) {
        console.error(chalk.red('Error: ANTHROPIC_API_KEY is not set.'));
        console.error('Please set it in your .env file or environment variables.');
        process.exit(1);
      }

      console.log(chalk.bold.blue('\n🤖 Lydia is starting...\n'));

      const spinner = ora('Initializing Agent...').start();

      try {
        const llm = new AnthropicProvider({
            defaultModel: options.model
        });
        const agent = new Agent(llm);

        // --- Event Listeners for UI ---

        agent.on('task:start', (task) => {
          spinner.succeed(chalk.green('Agent initialized'));
          console.log(chalk.bold(`\n📋 Task: ${task.description}\n`));
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
          console.log(chalk.bold('\n📝 Execution Plan:'));
          steps.forEach((s: any, i: number) => {
             const icon = s.type === 'action' ? '⚡' : '💭';
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
            symbol: '✅',
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
          spinner.stopAndPersist({ symbol: '❓', text: 'User Input Required' });

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
          spinner.succeed(chalk.bold.green('Task Completed Successfully! ✨'));
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
      console.log(chalk.green(`\n🚀 Dashboard running at: ${chalk.bold(url)}\n`));

      if (options.open) {
        await open(url);
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

        const mustConfirm = Array.isArray((strategy as any).constraints?.must_confirm)
          ? (strategy as any).constraints.must_confirm
          : [];
        const episodes = memory.listEpisodes(50);
        let totalTraces = 0;
        let confirmTraces = 0;
        const toolCounts: Record<string, number> = {};

        for (const ep of episodes) {
          if (!ep.id) continue;
          const traces = memory.getTraces(ep.id);
          for (const t of traces) {
            totalTraces += 1;
            toolCounts[t.tool_name] = (toolCounts[t.tool_name] || 0) + 1;
            if (mustConfirm.includes(t.tool_name)) {
              confirmTraces += 1;
            }
          }
        }

        const evaluation = {
          episodes: episodes.length,
          traces: totalTraces,
          confirm_required: confirmTraces,
          must_confirm: mustConfirm,
          tool_usage: toolCounts,
        };

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

      const loader = new ConfigLoader();
      await loader.update({ strategy: { activePath: proposal.strategy_path } } as any);
      memory.updateStrategyProposal(proposalId, 'approved');
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
        console.log(`${p.id} | ${p.status} | ${p.strategy_path}`);
      });
    });

  program.parse();
}

main();
