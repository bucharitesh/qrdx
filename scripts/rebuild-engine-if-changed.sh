#!/bin/sh
# Rebuilds packages/qrdx/dist after a pull, rebase or branch switch that
# changed the engine. The app imports the engine from dist/, so a stale build
# makes every page answer 500 ("Export … doesn't exist in target module").
# build:inplace never deletes dist/, so this is safe while `next dev` runs.
# Called from .husky/post-merge, post-checkout and post-rewrite with the
# commits before and after. Skip it with QRDX_SKIP_ENGINE_REBUILD=1.
from="$1"
to="$2"
[ -n "$CI" ] && exit 0
[ -n "$QRDX_SKIP_ENGINE_REBUILD" ] && exit 0
[ -z "$from" ] || [ -z "$to" ] || [ "$from" = "$to" ] && exit 0

changed=$(git diff --name-only "$from" "$to" -- packages/qrdx/src packages/qrdx/types packages/qrdx/package.json packages/qrdx/tsup.config.ts 2>/dev/null)
lockfile=$(git diff --name-only "$from" "$to" -- pnpm-lock.yaml 2>/dev/null)

if [ -n "$lockfile" ]; then
  echo "qrdx: pnpm-lock.yaml changed, run: pnpm install"
fi
[ -z "$changed" ] && exit 0

if [ ! -d node_modules ]; then
  echo "qrdx: the engine changed. Run: pnpm install && pnpm --filter qrdx build:inplace"
  exit 0
fi

echo "qrdx: the engine changed, rebuilding packages/qrdx/dist (build:inplace)…"
if pnpm --filter qrdx build:inplace >/dev/null 2>&1; then
  echo "qrdx: engine rebuilt"
else
  echo "qrdx: engine rebuild FAILED. Run: pnpm --filter qrdx build:inplace"
fi
exit 0
