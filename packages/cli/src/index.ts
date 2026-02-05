// CLI package entry point
import { program } from 'commander';
import chalk from 'chalk';

console.log(chalk.blue('Lydia CLI v0.1.0'));

program
  .name('lydia')
  .description('Lydia - AI Agent with Strategic Evolution')
  .version('0.1.0');

program.parse();
