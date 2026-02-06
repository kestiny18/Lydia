#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { Agent, AnthropicProvider } from '@lydia/core';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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

  program.parse();
}

main();
