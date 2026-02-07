---
name: node-project-management
description: Manage Node.js projects (init, install, test, run)
tags: [node, npm, pnpm, yarn, javascript, typescript]
---

# Node.js Project Management

This skill helps you manage Node.js projects, including initialization, dependency management, and running scripts.

## Capabilities

- Initialize new projects
- Install dependencies (detects package manager)
- Run scripts (test, build, dev)
- Check outdated packages

## Decision Tree

1. **Initialize Project**:
   - IF no `package.json`: Run `npm init -y` (or `pnpm init`).
   - IF TypeScript requested: Add `typescript`, `tsx`, `@types/node` and create `tsconfig.json`.

2. **Install Dependencies**:
   - Detect lockfile (`pnpm-lock.yaml`, `yarn.lock`, `package-lock.json`).
   - Use the corresponding package manager (`pnpm`, `yarn`, `npm`).
   - IF installing dev dependencies, use `-D`.

3. **Run Scripts**:
   - Check `package.json` "scripts" section.
   - Run `npm run <script>` (or `pnpm <script>`).

## Best Practices

- Always prefer `pnpm` if available.
- Use `tsx` for running TypeScript files directly.
- Ensure `.gitignore` includes `node_modules`.
