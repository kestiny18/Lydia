# Task Execution Chain Implementation Plan

## Objective
Deliver a reliable, end-to-end task execution chain that integrates with existing Lydia modules and surfaces reports and feedback.

## Phase 0: Design Validation (Complete)
- [x] Architecture design doc approved.

## Phase 1: Intent and Context (Week 1)
- [x] Extend Intent schema to IntentProfile.
- [x] Update IntentAnalyzer to emit IntentProfile.
- [x] Add TaskContext builder in Agent.

Deliverables:
- IntentProfile schema + tests
- TaskContext building logic

## Phase 2: Planning and Verification (Week 2)
- [x] Extend Plan schema with dependencies, risk tags, and verification.
- [x] Update SimplePlanner prompt to enforce these fields.
- [x] Add planner validation to enforce minimal verification steps.

Deliverables:
- PlanStep schema and mapping
- Planner tests for required fields

## Phase 3: Execution and Reporting (Week 3)
- [x] Add StepResult tracking in Agent execution loop.
- [x] Implement Reporter module to produce TaskReport.
- [x] Write TaskReport to MemoryManager.

Deliverables:
- Reporter module
- TaskReport storage and retrieval

## Phase 4: Feedback and UX (Week 4)
- [x] Implement FeedbackCollector and CLI prompt flow.
- [x] Store TaskFeedback in MemoryManager.
- [x] Add results presentation UI for TaskReports (summary + steps).

Deliverables:
- FeedbackCollector module
- TaskFeedback storage
- Task results presentation UI

## Phase 4b: Task Input UI (Week 4)
- [x] Add task input UI in dashboard.
- [x] Add API endpoint to run tasks.
- [x] Refresh reports on completion.
- [x] Add structured prompt assistant (goal/constraints/success criteria).

## Phase 5: Hardening (Week 5)
- [x] Failure-aware replan for downstream steps.
- [x] Update risk gating to include verification failures.
- [x] Add integration tests for full chain.

Deliverables:
- End-to-end chain tests
- Updated risk flow behavior

## Dependencies
- Requires existing Strategy schema and Agent runtime.
- Uses MemoryManager for storage.
- Reuses existing MCP tool interface.

## Success Criteria
- For any task, Lydia produces:
  - Structured plan with verification
  - Execution traces with outcomes
  - Task report stored in memory
  - Feedback prompt for high impact tasks
