#!/bin/bash
set -euo pipefail
if ((WORKER_CHECK_ONLY)); then
  if [[ -f "$FACTORY_ROOT/dist/cli.js" ]]; then echo "Factory build present"; else echo "Factory build missing"; fi
  exit 0
fi
# The package carries its own pnpm-workspace.yaml, so this install never joins
# an enclosing Morpheus workspace.
(cd "$FACTORY_ROOT" && pnpm install --frozen-lockfile && pnpm build)
echo "Factory package built"
