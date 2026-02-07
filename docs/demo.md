# Demo Script

This script shows Lydia's core loop: plan, approval, execute, and replay.

## Setup
```bash
pnpm install
pnpm build
pnpm tsx packages/cli/src/index.ts init
```

## Run a Task
```bash
pnpm tsx packages/cli/src/index.ts run "check git status"
```

## Launch Dashboard
```bash
pnpm tsx packages/cli/src/index.ts dashboard
```

## Optional Provider Overrides
```bash
pnpm tsx packages/cli/src/index.ts run --provider ollama "summarize this folder"
```

```bash
pnpm tsx packages/cli/src/index.ts run --provider openai "summarize this folder"
```

## Expected Outcomes
1. A plan is printed before execution.
2. High-risk actions ask for confirmation.
3. Replay data appears in the dashboard after execution.
