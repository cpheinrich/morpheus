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

## Independent review

Fresh Fleet independent review cleared the exact candidate. The reviewer reported one minor diagnostic issue; the author clarified the missing-Fleet-attempt message, reran all five gateway checks successfully, and retained passing complexity checks. No substantive findings remain.

```morpheus-review
{
  "version": 2,
  "base": "c287a69e23a1977d20a266ca9070ce684a367aa5",
  "reviewed": "69b1f120ed0b1d9a224dea1b9d8609170f5502a8",
  "covered": "a15ad2749211d9e2b68ec2d94db6c18ca88078ac",
  "authorSession": "01a2006b-4c48-7941-868e-a43c3ca68426",
  "reviewerSession": "dede7d9a-ef1a-41ca-8853-61cebc12aa88",
  "risk": "high",
  "elapsedMinutes": 4.5442833333333335,
  "timing": {
    "source": "runner",
    "durationMs": 272657,
    "evidence": "Fleet task 7befa6ed-3b89-4320-8f10-93c89293db3a guardian process.json monotonic duration, verified owned-process termination."
  },
  "outcome": "complete",
  "summary": "Fresh Fleet independent review cleared the exact candidate. The reviewer reported one minor diagnostic issue; the author clarified the missing-Fleet-attempt message, reran all five gateway checks successfully, and retained passing complexity checks. No substantive findings remain.",
  "contextRead": [
    "hq/product/roadmap/MO-26-11-21-15.18.22-provision-factory-credentials.md",
    ".agent/decisions.md",
    ".agent/worklog/2026-11-21-provision-factory-credentials.md",
    "docs/runbooks/local-credentials.md",
    "architecture.md",
    "plugins/factory/README.md"
  ],
  "findings": [
    {
      "id": "R1-M1",
      "severity": "minor",
      "description": "Suppose an operator runs the direct gateway-worker CLI (plugins/factory/scripts/gateway-worker.mjs:38), or any non-Fleet caller, with a canonical worker JSON that has fleetCredentials. There is no fleet binding, so enrolledCredentials throws 'Credential enrollment changed before invocation'. This fails closed, which is correct, but the message says the enrollment changed when it did not. The operator could end up chasing a config drift that never happened.",
      "paths": [
        "plugins/factory/src/gateway-worker.mjs"
      ],
      "disposition": "fixed",
      "response": "Added an explicit missing Fleet binding error before comparing enrollment digests. Matching enrollment and all refusal behavior remain the same. Five gateway checks and changed-family complexity pass."
    }
  ]
}
```
