# MVP Checklist and Success Criteria

This checklist defines what "MVP complete" means for Lydia.

## MVP Checklist
1. `lydia init` creates config, strategy, and skills folders.
2. `lydia run "check git status"` completes with a plan and execution.
3. Provider selection works for `ollama`, `openai`, `anthropic`, and `mock`.
4. Fallback order defaults to `ollama > openai > anthropic`.
5. Safety approvals are required for high-risk actions.
6. Strategy proposals can be created and reviewed.
7. Replay data is visible in the dashboard.
8. Internal dogfooding checklist completed.

## Success Criteria
1. First-time setup completes in under 5 minutes.
2. One full demo run succeeds without manual code changes.
3. At least one strategy proposal can be approved or rejected.
4. Logs and replay traces are inspectable from the dashboard.
5. A basic local LLM workflow is possible with Ollama.
6. Install success rate >= 90 percent on clean machines.
