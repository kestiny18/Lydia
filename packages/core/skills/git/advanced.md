---
name: git-advanced-workflow
description: Advanced Git workflows (branching, merging, rebasing, stashing)
tags: [git, version-control]
---

# Git Advanced Workflow

This skill guides you through advanced Git operations beyond simple commits.

## Feature Branch Workflow

1. **Start Feature**:
   - `git checkout -b feat/feature-name`
   - Work on changes...

2. **Sync with Main**:
   - `git checkout main`
   - `git pull`
   - `git checkout feat/feature-name`
   - `git rebase main` (Preferred over merge for clean history)

3. **Handle Conflicts**:
   - IF conflicts during rebase:
     - Fix files
     - `git add <file>`
     - `git rebase --continue`

4. **Finish Feature**:
   - Ensure tests pass
   - `git push -u origin feat/feature-name`
   - Open Pull Request (via gh cli if available, or manual)

## Stashing

- IF you need to switch context but aren't ready to commit:
  - `git stash push -m "WIP: description"`
- To retrieve:
  - `git stash pop`

## Clean Up

- Delete local branch after merge: `git branch -d feat/feature-name`
