param()

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Write-Error "pnpm is required. Install it first."
  exit 1
}

pnpm install
pnpm build
pnpm tsx packages/cli/src/index.ts init

Write-Host "Lydia is initialized. Try:"
Write-Host "  pnpm tsx packages/cli/src/index.ts run `"check git status`""
