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

Late CI correction scope: the current head had one full-suite pass and another full-suite run
with 3287/3288 passing. The only failure was the pre-existing QA responder fixture: it waited for
the child's `resolved` file before the child unlinked the claim and exited. An early claim
assertion could fail and the test's cleanup then killed the child, masking the assertion as exit1.
The fixture now waits for the existing responder completion log after successful child close and
claim release, and retains its exact ordering/ownership/descendant assertions. This bounded
test-only synchronization correction is required to finish CI delivery; the same reviewer will
inspect it as the first allowed follow-up. Production QA behavior is unchanged. No unchanged
suite was rerun merely to obtain a favorable result.

The same reviewer cleared that test-only correction with no findings after inspecting the CI
log and exact responder control flow. `pnpm exec vitest run tests/qa-comments.test.ts` passed all
34 tests, and `pnpm typecheck` passed. The follow-up took 44,000ms measured by author clocks.

A read-only probe of the reviewed projection adapter against the existing authenticated local
Paperclip service returned 55 issues, 24 agents and 32 bounded comments in 87,589 bytes, with
issue/agent truncation false and comment truncation true. Observation time was
1792971015808. Only counts/flags/time/bytes were emitted; no source text, credentials, native
identities, bridge calls or provider work were emitted or invoked.

The lead requested one inseparable pilot deployment correction before activation: declare
`maxInstances: 1` and `minInstances: 0` on each callable to bound allocation and idle instances.
This touches the existing wrapper, its focused options assertion and the explanatory contract.
The second ordinary same-reviewer follow-up covers this deployment cap; no new authority or
runtime service account is introduced. The two HQ focused files now pass 26 tests; optional
Firebase build and root typecheck also pass. A refreshed full sanitized fixture was saved only
to a private0600 temporary file for the lead's authenticated visual work, never committed.
The same reviewer cleared that deployment cap with no findings in 25,000ms, checking all nine
definitions and the installed Firebase option types. This completes the three ordinary review
turns; any further correction must satisfy the runbook's narrow verification scope or receive
explicit human authorization. Fresh shared quota at this checkpoint was 70% weekly used.

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
  "covered": "2548c73f840a346db24d0ef99839f7041bd840a6",
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
  "findings": [],
  "followUps": [
    {
      "reviewerSession": "/root/hq_connector_projection/review_hq_projection",
      "commit": "d6d73c44ca6e9c73e44c0c15a8b44dcb0c45e35a",
      "outcome": "cleared",
      "scopeReason": "Late test-only CI correction: wait for the pre-existing QA fixture child completion receipt before asserting claim cleanup, after the full-suite race blocked delivery. Production QA behavior and pilot implementation are unchanged.",
      "elapsedMinutes": 0.7333333333333333,
      "timing": {
        "source": "clock",
        "durationMs": 44000,
        "evidence": "First ordinary follow-up /root/hq_connector_projection/review_hq_projection: author clock 2026-10-25T23:29:53Z before followup_task; receipt clock 2026-10-25T23:30:37Z immediately after final response."
      },
      "summary": "Cleared the bounded QA fixture synchronization correction with no findings after inspecting the CI log and responder lifecycle; relied on the author's 34-test focused pass."
    },
    {
      "reviewerSession": "/root/hq_connector_projection/review_hq_projection",
      "commit": "2548c73f840a346db24d0ef99839f7041bd840a6",
      "outcome": "cleared",
      "scopeReason": "The lead added an inseparable pilot deployment allocation constraint before activation: cap every callable at one instance and zero warm instances. This turn covers the wrapper option, focused assertion and explanatory contract.",
      "elapsedMinutes": 0.4166666666666667,
      "timing": {
        "source": "clock",
        "durationMs": 25000,
        "evidence": "Second ordinary follow-up /root/hq_connector_projection/review_hq_projection: author clock 2026-10-25T23:33:43Z before followup_task; receipt clock 2026-10-25T23:34:08Z immediately after final response."
      },
      "summary": "Cleared all nine callable allocation caps and focused assertion/documentation with no findings; installed Firebase option types support both settings."
    }
  ]
}
```
