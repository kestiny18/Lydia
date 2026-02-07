#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { Agent, AnthropicProvider, ReplayManager } from '@lydia/core';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import open from 'open';
import { createServer } from './server/index.js';

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

  program.parse();
}

main();
