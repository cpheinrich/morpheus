#!/bin/sh
# morpheus:session-start:v1
set -u

if command -v morpheus >/dev/null 2>&1; then
  if morpheus self auto-update status >/dev/null 2>&1; then
    exec morpheus context brief
  fi
fi

cat <<'MORPHEUS_BOOTSTRAP_REQUIRED'
Morpheus bootstrap required.
The installed Morpheus CLI is absent or predates version-independent self-update.
Ask the user exactly: "Morpheus is stale. Enable automatic updates after pulls on this device?"
Do not infer consent.
If yes, run: sh .morpheus/bootstrap.sh enable
If no, run: sh .morpheus/bootstrap.sh disable
A yes installs current reviewed Morpheus main as a standalone global package, registers this project, and installs managed Git hooks. A no only records the choice.
MORPHEUS_BOOTSTRAP_REQUIRED
