---
agent: codex
date: 2026-08-28
roadmap: MO-26-08-28-14.19.10
outcome: review
---

# Include HQ search in the web scaffold

## What changed

- `morpheus web init` now writes the shared search dependency, a visible HQ
  search wrapper, an allowlisted search catalogue, and a private static index
  route.
- The generated HQ layout versions the lazy-loaded index with the Vercel
  deployment commit so immutable browser caches update with each deploy.
- Scaffold tests cover first-run output, idempotent re-runs, dependency merging,
  and the existing no-Firebase safety boundary.
- Architecture documentation now treats search as part of the standard HQ
  scaffold and keeps catalogue ownership with each project.

## Dead ends

- Importing `server-only` in the generated catalogue would have required every
  consumer and direct Node test environment to provide Next's marker package.
  Route-only imports already keep this module on the server side, so the
  scaffold avoids that unnecessary coupling.

## Verification

- TypeScript typecheck passed.
- Full suite passed: 35 files and 1,004 tests.
- Compiled distribution refreshed successfully.
- Project-management indexing and validation passed.
- The refreshed fast graph recorded no gaps in the changed implementation;
  scaffold tests are intentionally excluded from fast indexing and were read
  and run directly.
