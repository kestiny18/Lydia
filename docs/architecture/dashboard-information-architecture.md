# Dashboard Information Architecture

## Purpose
This document defines the workspace boundaries and dashboard-vs-CLI capability coverage.

## Workspace Responsibilities

| Workspace | Primary Goal | What Users Do Here |
| --- | --- | --- |
| Tasks | Execute tracked work end-to-end | Create tasks, watch live execution, answer approvals, resume interrupted runs, review reports |
| Chat | Explore conversationally | Ask follow-up questions, brainstorm, request clarification without opening a tracked run |
| Memory | Inspect stored knowledge | Review facts, replay episodes, inspect task memory artifacts |
| Control | Operate governance and system safety | Review strategy proposals, approvals, MCP server health |
| Setup | Bootstrap and configure runtime | Initialize local workspace, configure provider/API keys, test LLM connectivity |

## Tasks vs Chat

- Tasks: lifecycle-driven execution with status, checkpoints, traces, and reports.
- Chat: free-form multi-turn dialog optimized for discovery and iterative guidance.

## Dashboard vs CLI Parity

### Fully supported in Dashboard
- Initial setup (`~/.lydia` bootstrap)
- Provider and API key configuration
- LLM connectivity test
- Run, monitor, and resume tasks
- Review reports, replay, strategy proposals, and MCP health

### CLI still recommended (advanced paths)
- Scriptable/batch operations for CI
- Fast terminal-first workflows (`lydia run`, `lydia tasks`, `lydia mcp check`)
- Skill installation from GitHub and local paths
- Automation pipelines without browser dependency
