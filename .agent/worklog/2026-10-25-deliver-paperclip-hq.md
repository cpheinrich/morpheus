---
roadmap: MO-26-10-25-16.14.38
tags: [engineering, devops, infrastructure]
agent: codex
---

# Authenticated Paperclip HQ pilot

Mandate: Chris requested the HQ interface, authenticated connector and live projections so he can test Paperclip through HQ, including a persistent MacBook Pro Paperclip service. Extend the accepted one-company Firebase/private-controller design, one Pool and existing scheduler. Normal source review/CI/merge and reversible pilot deployment/configuration are authorized; no paid overage, new billing plan, widened human access or database replacement.

Acceptance: the existing persistent service is authenticated and retains company data; an existing HQ authenticated user sees actual Paperclip issues/agents and bounded conversation observations with freshness/offline state; controls reuse typed operation IDs and existing admission; connector renews its Firebase identity and survives normal reconnect without duplicating work. Inspect rendered UI and verify authenticated/unauthorized reads and recovery. Report unqualified aspects separately.

Budget: Codex started68% weekly used; hard75% used /25% remaining. Reserve0.8 point for service verification,3 for backend/connector implementation and its delivery review,2.2 for HQ consumer/UI,1 for coordination/final review; settle shared usage at checkpoints and stop admissions before exhausting in-flight reserve. Main Claude fresh92% weekly used, below its20% remaining floor; no inference. Zoe Claude fresh quota unavailable; no inference. No API/credits/reset fallback.

Persistent service independently verified already healthy: enabled gui/501/ing.paperclip.paperclipai, KeepAlive and RunAtLoad, authenticated API127.0.0.1:3100, existing company4925919d-5666-4a4e-b4c5-b59cc0176eee, embedded loopback Postgres and backups retained. Crash/reboot/restore not qualified. Private sanitized proof is in existing interactive-20261024 runtime root. No restart or worker launch needed.

Initial consumer target proposed cpheinrich.com/hq, pending optional user preference. Existing website is legacy web/ rather than apps/web. Required web init --no-provision created an unwanted scaffold; the exact seven generated files were immediately removed, leaving the original work untouched. Extend the existing app and report the survey mismatch rather than duplicate it.

Tier2 graph: Morpheus generation2026-10-25T14:25:10Z,11854nodes; exact createBackend snippet and all4 depth1 createConnector callers read. Relevant transport/facade coverage metadata matches with no recorded gaps; best-effort only. Consumer project name is Users-chrisheinrich-code-cpheinrich.com; current auth/admin discovery ongoing.

## Source implementation

Extended the existing callable owner with connector-only `hqPublish`, live-human `hqSnapshot`,
a private single-company projection store, loopback board/agent/comment allowlist, token-renewing
outbound daemon and separate lifetime/tick ownership. Preserved operation UUIDs, existing Pool
actions and uncertain-outcome journals. Source text remains untrusted; display bounds, common
credential redaction, response/publication byte caps, company/comment binding, server publication
time and monotonic observations limit the read surface. Known arbitrary secrets in source prose
cannot be identified universally, so the contract explicitly excludes putting credentials there.

An exact pre-existing verified UID/email mapping supports the consumer's legacy HQ allowlist
without changing its Firebase custom claims. The backend reads current Auth records every time;
connector identities never gain human operations. Refresh responses must preserve the pinned
connector UID. Rotation saves owner-only credentials atomically before using the new ID token.

Design critique by fresh reviewer `/root/hq_connector_projection/review_hq_projection` preceded
wide implementation and asked for byte/time bounds, monotonic freshness, exact live authorization,
rotation/redaction and distinct ownership locks. Those constraints were included. This design
critique is not source clearance; the prepared source review is recorded separately below.

Small build/borrow check: npm registry reports p-retry 8.0.1 modified 2026-09-01 with one direct
dependency, Firebase 13.1.0 modified 2026-10-21 with 31 direct SDK dependencies. Fixed domain
polling and the documented Firebase Secure Token refresh use existing Node/Zod and add no package.
The [first-party REST contract](https://firebase.google.com/docs/reference/rest/auth?authuser=cpheinrich@gmail.com#section-refresh-token)
was checked against the request/response implementation.

The daemon stops admitting further commands on SIGTERM/SIGINT and finishes its in-flight
operation. A 90-second bridge observation deadline journals unknown instead of retrying a
possibly accepted effect. Network passes back off to 60 seconds. Crash-preserved locks still
require explicit ownership inspection. The consumer must pin its existing coordinator home and
bridge runtime, allow a 300-second service shutdown, and retain private logs and credentials.

## Validation before source review

- `pnpm exec vitest run tests/paperclip-hq.test.ts tests/paperclip-hq-live.test.ts`: 25 passing
  tests. This scope covers the changed callable, projection/runtime and direct connector path.
- `pnpm typecheck`: passed.
- `pnpm --dir scripts/paperclip-hq install --ignore-workspace --frozen-lockfile --ignore-scripts`
  and `pnpm --dir scripts/paperclip-hq run build`: passed. The first direct compile correctly
  refused missing optional Firebase packages; installing the existing pinned lockfile resolved it.
- `JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH npm exec --yes --package firebase-tools@15.30.1 -- node scripts/paperclip-hq/run-emulators.mjs`:
  passed the actual demo-only Auth/Functions/Firestore test, including projection authorization,
  live legacy verification, old-observation refusal, direct projection-read denial, existing
  delivery-once and actor revocation. Default macOS Java was absent; the existing Homebrew JDK21
  resolved it. Host Node26 was used; required CI separately verifies Node22. No native provider
  or paid API was launched.
- `pnpm compile`, `pnpm morpheus pm index`: passed; no generated distribution/index changes.
- Full local suite intentionally omitted because this change does not touch shared core; CI owns
  the full suite. Consumer deployment/rendered UI/token renewal across a real expiry remain lead
  acceptance work, separate from this source evidence.

Fresh shared Codex quota at the implementation checkpoint remained 68% weekly used; no Claude,
credit, reset, overage, native-worker or model API route was used.

## Independent source review

The independent high-risk source review cleared the implementation with no findings. The
reviewer independently ran both focused test files (25 passed), checked the complete diff,
authorization, projection bounds/isolation, token rotation, ownership/shutdown and uncertain
operation preservation. Consumer deployment, rendered UI, actual token-expiry recovery and
crash recovery remain separate acceptance work.

```morpheus-review
{
  "version": 2,
  "base": "8ba59081a39807197a5d8595ee04a94f7afc0e9d",
  "reviewed": "06f2661615dfb2b991cacb399ecb282c8e25efb0",
  "covered": "06f2661615dfb2b991cacb399ecb282c8e25efb0",
  "authorSession": "01a1755a-96c3-7c41-860e-c5178e43bae6",
  "reviewerSession": "/root/hq_connector_projection/review_hq_projection",
  "risk": "high",
  "elapsedMinutes": 2.3666666666666667,
  "timing": {
    "source": "clock",
    "durationMs": 142000,
    "evidence": "Initial source-review invocation /root/hq_connector_projection/review_hq_projection: author clock 2026-10-25T23:23:16Z immediately before followup_task; receipt clock 2026-10-25T23:25:38Z immediately after final response. Earlier design critique was separate."
  },
  "outcome": "complete",
  "summary": "The independent high-risk source review cleared the implementation with no findings.",
  "findings": []
}
```
