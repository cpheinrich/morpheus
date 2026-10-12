---
roadmap: MO-26-10-12-12.10.39
---
# Explain session Git timeouts

Reproduced #333 using an actual Node subprocess killed by its timeout. sessionGit previously
propagated only the generic command failure; Node retained killed/signal/code separately.
It now recognizes that timeout shape and prepends the 30-second deadline, SIGTERM and remote
network guidance, retaining the original error as cause. Ordinary failures and stderr are
returned unchanged, including max-buffer, external termination and ENOENT cases. Success
still trims stdout. No retry, deadline or freshness policy changes, and no new dependency.

Validation: pnpm install --frozen-lockfile; focused session-git/session-start/session-gate tests;
pnpm typecheck; pnpm compile; pnpm morpheus pm index; pnpm lint; pnpm morpheus inbox validate.
The new timeout expectation failed against the original code. The first fixture's beforeEach
returned a mock function, which Vitest treated as cleanup and invoked; fixed the fixture to
return void, then verified timeout and passthrough behavior. Full-suite result recorded below.

Graph discovery found sessionGit in src/session/start.ts in generation2026-10-12T19:01:36Z;
subsequent trace/coverage calls failed with Transport closed. Read the function, direct callers
and focused tests from source instead; no graph completeness claim.

Full validation: `pnpm test` passed all 2,110 tests across 75 files in 60.19 seconds.
