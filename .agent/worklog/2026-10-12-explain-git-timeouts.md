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

Independent review cleared the exact remote implementation head with no findings. The reviewer traced timeout diagnostics through startup, refresh and claim callers, confirmed ordinary errors retain identity and stderr, and independently passed all six session-Git tests. Source and generated output were inspected directly because graph coverage described the primary checkout.

```morpheus-review
{
  "version": 2,
  "base": "b998aaf4596935e26dd7c9565e48fa9253f8377f",
  "reviewed": "89b58b484f300da6ad88e616d1dd42461dedd561",
  "covered": "89b58b484f300da6ad88e616d1dd42461dedd561",
  "authorSession": "01a1317d-1201-7161-a2b9-b09e0a7fe8ab",
  "reviewerSession": "/root/review_git_timeouts",
  "risk": "normal",
  "elapsedMinutes": 2.08695,
  "timing": {
    "source": "clock",
    "durationMs": 125217,
    "evidence": "Reviewer /root/review_git_timeouts invocation start 2026-10-12T19:17:57.612826+00:00; completion observed 2026-10-12T19:20:02.829033+00:00."
  },
  "outcome": "complete",
  "summary": "Independent review cleared the exact remote implementation head with no findings. The reviewer traced timeout diagnostics through startup, refresh and claim callers, confirmed ordinary errors retain identity and stderr, and independently passed all six session-Git tests. Source and generated output were inspected directly because graph coverage described the primary checkout.",
  "findings": []
}
```
