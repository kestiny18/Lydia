#!/usr/bin/env bash
set -euo pipefail

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required. Install it first."
  exit 1
fi

pnpm install
pnpm build
pnpm tsx packages/cli/src/index.ts init

echo "Lydia is initialized. Try:"
echo "  pnpm tsx packages/cli/src/index.ts run \"check git status\""
