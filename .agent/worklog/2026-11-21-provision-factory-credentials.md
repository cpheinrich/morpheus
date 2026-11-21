---
date: 2026-11-21
agent: codex
roadmap: MO-26-11-21-15.18.22
outcome: in-progress
tags: [engineering, devops]
summary: Attach protected credential companions to explicitly enrolled single-project Fleet attempts.
---

# Single-project Factory credential companions

The ordinary Git checkout path did not attach a companion. Add protected worker-local
`fleetCredentials` enrollment and reuse the related-workspace pointer, wrapper and symlink
checks at the common provider launch gate. The first admission creates the ignored link;
continuation validates it against the saved enrollment. Completed-result recovery repeats
those checks but preserves independent cleanup proof if restoration is refused. No new
dependency, controller grant or provider environment inheritance.

The live Morpheus Context MCP covered the roadmap, architecture, core and decisions in
the admitted checkout. The worker lacked the exact-checkout codebase-memory service;
verified the parent graph trace against the checked-in Factory source. The delegated
checkout was detached at `ed9590b724948240b54047d07fb398a2921741a6` with the published
claim and acceptance in ancestry. Did not create another checkout or change branches.

Synthetic fixtures cover both providers and the ordinary `list`, `doctor`, and trusted
`run` paths, no provider-side injection, absent enrollment, rejected authority and pin
mismatches, a changed working pointer, and link or parent redirection during resume and
recovery. Checks run:

- `node --test` on `fleet-workspace`, `fleet-source`, `fleet-execution`, `fleet-input-files`,
  `gateway-workers`, and `unattended-worker`: 83 passed. These cover the shared checkout,
  launch, continuation, recovery, and private input paths.
- `pnpm exec vitest run tests/credentials.test.ts`: 16 passed.
- `pnpm typecheck`, `pnpm compile`, `pnpm lint`, `pnpm morpheus pm index`,
  `pnpm --dir plugins/factory check`, and `git diff --check`: passed.
- `morpheus complexity check --base HEAD`: enforce, 39 functions checked, no findings.

No full suite or live credential checks were run.

Independent review and protected delivery are owned by the parent. Real host/account
provisioning and idle-boundary canaries remain open. No external provider, credential,
repository delivery, or deployment changes were made by this worker.

## Controller verification

Root verified the implementation artifact digest and exact source. After normal root/plugin dependency setup, 78 affected/direct-dependent Node checks passed, then the five gateway checks passed. Credentials Vitest 16/16, typecheck, compile and plugin check passed. Complexity passed for 39 changed functions and 229 measured in four files. Private operator provisioning and trusted read probes verified the actual companion and PostHog definition access under all seven authorized execution accounts. Live native qualification of the reviewed runtime follows protected delivery.
