import { Command } from 'commander';
import { ReviewManager, StrategyBranchManager } from '@lydia/core';
import inquirer from 'inquirer';
import chalk from 'chalk';

export function reviewCommand() {
    const command = new Command('review');

    command
        .description('Review pending strategy updates')
        .action(async () => {
            const reviewManager = new ReviewManager(); // Uses default .lydia/reviews.json
            const branchManager = new StrategyBranchManager(); // Uses default .lydia/strategies

            await reviewManager.init();
            await branchManager.init();

            const pending = await reviewManager.listPending();

            if (pending.length === 0) {
                console.log(chalk.green('No pending reviews.'));
                return;
            }

            console.log(chalk.bold(`Found ${pending.length} pending reviews:\n`));

            for (const req of pending) {
                console.log(chalk.cyan(`ID: ${req.id}`));
                console.log(`Source: ${req.source}`);
                console.log(`Branch: ${req.branchName}`);
                console.log(`Summary: ${req.diffSummary}`);
                console.log(chalk.gray(`Validation: ${req.validationResult.status} ${req.validationResult.reason || ''}`));
                console.log('-'.repeat(40));
            }

            const { action } = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'action',
                    message: 'What would you like to do?',
                    choices: [
                        { name: 'Approve a request', value: 'approve' },
                        { name: 'Reject a request', value: 'reject' },
                        { name: 'Exit', value: 'exit' }
                    ]
                }
            ]);

            if (action === 'exit') return;

            const { reqId } = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'reqId',
                    message: 'Select request:',
                    choices: pending.map(r => ({ name: `${r.id} - ${r.diffSummary}`, value: r.id }))
                }
            ]);

            if (action === 'approve') {
                const req = pending.find(r => r.id === reqId)!;
                try {
                    console.log(chalk.yellow('Merging branch...'));
                    await branchManager.mergeBranch(req.branchName);

                    await reviewManager.updateStatus(reqId, 'approved');
                    console.log(chalk.green(`Request ${reqId} approved and merged.`));
                } catch (e) {
                    console.error(chalk.red(`Failed to merge: ${e}`));
                }
            } else if (action === 'reject') {
                await reviewManager.updateStatus(reqId, 'rejected');
                // Optionally delete branch?
                console.log(chalk.yellow(`Request ${reqId} rejected.`));
            }
        });

    return command;
}
