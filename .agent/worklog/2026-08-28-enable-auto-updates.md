---
agent: codex
date: 2026-08-28
roadmap: MO-26-08-28-14.35.50
outcome: review
---

# Enable consented Morpheus auto-updates

## What changed

- Added a remembered device-level enable/disable preference and `self ensure` freshness gate.
- Added managed `post-merge` and `post-rewrite` blocks across the local project registry, including
  automatic inheritance when a later project is registered.
- Preserved existing shell hooks byte-for-byte when Morpheus is disabled; incompatible or malformed
  hooks are reported and left untouched.
- Changed the session brief and generated project instructions to ask once when a stale device has
  no preference. An older CLI uses its existing disposable `self update` path after consent.

## Dead ends and boundaries

- A hook committed by a repository cannot activate itself during the pull that delivers it. Git's
  separation is a necessary trust boundary, not a missing configuration switch. The checked-in
  session instructions are therefore the first-use bridge.
- A global `core.hooksPath` would make rollout easy but would bypass project-local hooks, including
  Lakina's Git LFS hooks. Managed project-local blocks preserve that composition.
- Update failures are visible but cannot fail an already-completed pull or rebase. Offline and
  unverifiable states defer rather than replacing a known install with unverified code.

## Verification

- TypeScript typecheck and build passed.
- The full suite passed: 36 test files and 1,011 tests.
- Hook tests cover explicit consent, idempotent enable, existing-hook preservation, fail-open hook
  execution, disable, incompatible hooks, registry inheritance, offline deferral, and update locking.
- The refreshed moderate code graph recorded no coverage gaps in any changed source path; tests are
  excluded from that graph by design and were read and run directly.
