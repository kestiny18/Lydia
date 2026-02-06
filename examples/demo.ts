import 'dotenv/config';
import { Agent, AnthropicProvider } from '../packages/core/src/index.js';

async function main() {
  console.log('🚀 Starting Lydia Demo...\n');

  // 1. Initialize LLM
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ Error: ANTHROPIC_API_KEY is not set in .env file');
    process.exit(1);
  }

  const llm = new AnthropicProvider();
  console.log(`🤖 LLM Provider: ${llm.id}`);

  // 2. Initialize Agent
  const agent = new Agent(llm);

  // 3. Setup event listeners for observability
  agent.on('task:start', (task) => console.log(`\n📋 Task Started: "${task.description}"`));

  agent.on('intent', (intent) => {
    console.log(`\n🧠 Intent Analysis:`);
    console.log(`   Category: ${intent.category}`);
    console.log(`   Summary:  ${intent.summary}`);
  });

  agent.on('plan', (steps) => {
    console.log('\n📝 Generated Plan:');
    steps.forEach((s: any, i: number) => {
      const typeIcon = s.type === 'action' ? '⚡' : '💭';
      console.log(`   ${i + 1}. ${typeIcon} [${s.type.toUpperCase()}] ${s.description}`);
    });
  });

  agent.on('step:start', (step) => {
    console.log(`\n▶️ Executing Step: ${step.description}`);
    if (step.tool) {
      console.log(`   🛠️ Tool: ${step.tool} ${JSON.stringify(step.args)}`);
    }
  });

  agent.on('step:complete', (step) => {
    // Truncate long results for display
    const result = step.result?.length > 100
      ? step.result.substring(0, 100) + '...'
      : step.result;
    console.log(`   ✅ Result: ${result}`);
  });

  agent.on('task:complete', () => console.log('\n✨ Task Completed Successfully!'));
  agent.on('task:error', (err) => console.error('\n❌ Task Failed:', err));

  // 4. Run a test task
  // Updated task to verify real MCP capabilities
  const userRequest = "Create a file named 'hello_lydia.txt' with content 'Hello from the real MCP world!' and then read it back to verify.";
  console.log(`\n👤 User Request: "${userRequest}"`);

  await agent.run(userRequest);
}

main().catch(console.error);
