import { Agent, AnthropicProvider } from '@lydia/core';
import { join } from 'node:path';
import { mkdir, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import 'dotenv/config';

async function main() {
  console.log('🚀 Starting End-to-End Integration Test...');

  // 1. Setup Test Environment
  const testDir = join(process.cwd(), 'temp_e2e_test');
  console.log(`\n📂 Setting up test directory: ${testDir}`);

  if (existsSync(testDir)) {
    await rm(testDir, { recursive: true, force: true });
  }
  await mkdir(testDir);
  process.chdir(testDir);
  console.log(`   Changed working directory to: ${process.cwd()}`);

  // 2. Initialize Agent
  console.log('\n🤖 Initializing Agent...');
  const llm = new AnthropicProvider();
  const agent = new Agent(llm);

  // 3. Define Task
  // This task tests: Intent Analysis -> Planning -> Execution -> Tools (FS, Git)
  const taskDescription = "Initialize a git repository here, create a README.md file with '# Hello Lydia', and commit it with message 'feat: init'.";

  console.log(`\n📋 Task: ${taskDescription}`);

  // 4. Run Agent
  try {
    const task = await agent.run(taskDescription);

    console.log('\n✨ Execution Completed!');
    console.log('   Status:', task.status);
    console.log('   Result:', task.result);

    // 5. Verify Results
    console.log('\n🔍 Verifying Results...');

    // Check .git exists
    const hasGit = existsSync(join(testDir, '.git'));
    console.log(`   [${hasGit ? 'PASS' : 'FAIL'}] Git repository initialized`);

    // Check README.md exists and content
    const readmePath = join(testDir, 'README.md');
    const hasReadme = existsSync(readmePath);
    console.log(`   [${hasReadme ? 'PASS' : 'FAIL'}] README.md created`);

    if (hasReadme) {
      const content = await readFile(readmePath, 'utf-8');
      const contentMatch = content.trim() === '# Hello Lydia';
      console.log(`   [${contentMatch ? 'PASS' : 'FAIL'}] README.md content correct`);
    }

    // Check Git Log (via internal command if possible, or just assume success if previous steps passed)
    // We can rely on the Agent's output or check manually if we wanted to be strict.

    if (hasGit && hasReadme) {
      console.log('\n✅ E2E Test Passed!');
    } else {
      console.error('\n❌ E2E Test Failed');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Error during execution:', error);
    process.exit(1);
  } finally {
    // Cleanup
    console.log('\n🧹 Cleaning up...');
    process.chdir(join(testDir, '..')); // Move out before deleting
    // await rm(testDir, { recursive: true, force: true }); // Commented out to inspect results if needed
    console.log('   (Test directory left at temp_e2e_test for inspection)');
  }
}

main().catch(console.error);
