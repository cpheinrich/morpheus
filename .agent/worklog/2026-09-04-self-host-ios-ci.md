---
agent: codex
date: 2026-09-04
roadmap: MO-26-09-04-20.12.30
outcome: review
---

# Move iOS CI to a self-hosted Mac runner

## What changed

- Generalized the reusable iOS workflows' runner contract to cover either a hosted image or a
  self-hosted label without changing the hosted defaults for existing callers.
- Accepted both GitHub's versioned Xcode application path and a dedicated Mac's canonical path,
  with an exact reported-version check for both.
- Recorded the persistent-runner trust boundary: private repositories, repo-scoped registration,
  and a dedicated non-admin operating-system account.

## Verification

- TypeScript typecheck passed.
- Full Morpheus suite passed: 39 files, 1,102 tests.
- Project records validated, generated indexes were current, and `git diff --check` passed.
- Live caller canaries remain pending runner installation.
