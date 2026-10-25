---
roadmap: MO-26-10-25-03.51.19
tags: [engineering, devops, infrastructure]
---
# Paperclip HQ implementation — October 25

## Mandate and acceptance

Chris: “take these responses and run with them … the rest … unsupervised … push it as far as
you can within the context of this design and session.” Final QA batch
20261025T103419Z-l83tuy chooses the MacBook Pro controller for v1, Firebase/Cloud Functions
for HQ, shared runner titles and Paperclip conversations with versioned Git closeout.
A cloud controller is not a prerequisite. Existing Markdown inboxes remain until migration
is qualified. No repository review, CI or branch control was waived.

Outcome: connect an authenticated HQ request through outbound private Mac transport to the
existing shared Pool, with durable operation receipts and a separate verifiable Git closeout.
Acceptance: duplicates cannot create duplicate native turns; uncertain effects remain unknown;
stale claimants cannot execute or complete; revoked actors and mismatched company/configuration
refuse; reconnect publishes a saved receipt without relaunch; desktop behavior stays intact;
stop requested differs from verified termination; closeout repeat/reopen preserves hashes.
Emulator and fake-worker evidence is distinct from live-provider or production qualification.

Authority: code, ordinary independent review/CI/PR merge, reversible local prototypes/emulators,
and existing private-controller probes. No paid cloud resource, public deployment, new vendor
or auth grant, provider API overage or subscription reset is inferred. Actual connector enrollment
and consumer deployment require concrete qualification. No messages to other people authorized.

## Shared subscription ledger

| Admission | Reservation | Evidence / settlement |
|---|---|---|
| Parent implementation | Up to 20 percentage points | Baseline Codex 22% weekly used; current global read 27% used at 11:12Z |
| Pool actor worker | Up to 10 points | Dedicated isolated claimed task; extension ten minutes within reservation |
| Closeout worker | Up to 8 points | Dedicated isolated claimed task |
| Independent reviews | Up to 9 points | Four for closeout, five for pool; parent retains its own reserved runway |

These are admission maxima, not measured per-agent charges. Actual usage comes from shared
provider telemetry; no token-to-quota estimate is substituted. Baseline plus these reservations
is 69% used. Stop admitting new work around 68–70% used; hard ceiling is 75% used, preserving
Chris's 25% remaining. Ordinary Codex subscription use is explicitly allowed. No unknown paid
liability was introduced. Main Claude reports 88% weekly used / 12% remaining, below its 20%
reserve; its responder refused before provider launch. No Claude, overage, reset or API fallback.

## Design critique before implementation

The fresh read-only hq_design_critique agent accepted the narrow design with concrete fixes:
operation-to-conversation/turn must persist before effects; use a client-denied transport namespace
outside /hq; fence applying claims and never automatically replay uncertain effects; pin the
controller/company/profile; refresh user authorization at application; bound projections; separate
stop receipts from termination. The Mac uses narrow callable APIs rather than Firestore Admin
credentials. First slice is explicitly one company, with no second scheduler or Pool.

Registry check: maintained official firebase-functions 7.4.0 and firebase-admin 14.5.0, both
modified October 21, have five/seven direct dependencies. Keep them in an optional prototype
package rather than the kit runtime. Existing Zod and Node APIs fit the domain command contract;
no generic queue/framework is needed. Official Firebase callable, overlapping-rules and
transaction documentation informed the implementation. No external effects occur inside a
Firestore transaction callback, which Firebase may retry.

Graph project Users-chrisheinrich-code-morpheus, Tier 2 generation 2026-10-25T09:31:59Z,
10945 nodes. Role/rules and existing bridge evidence paths had matching metadata and no recorded
gaps. Later trace/snippet/coverage calls closed; exact source reads and newly authored source are
the fallback, not claims of complete graph coverage. Explorers covered existing Pool and HQ seams;
separate workers own separate claimed worktrees. New main tags/DevOps direction was read and merged.

## Implementation and verification

The optional prototype provides strict typed commands; fresh admin/employee/connector identity
checks; private Firestore command ledger; idempotent enqueue; fenced claim/begin/receipt; expired
applying-to-unknown behavior; private Mac journals and reconnect handling; seven callable wrappers;
a bounded outbound operator pass; and a path-scoped emulator CI job. The existing bridge owns
native effects. The full HQ UI, continuous auth and multi-company routing are not claimed.

Focused verification: `pnpm exec vitest run tests/paperclip-hq.test.ts tests/workflows.test.ts`
passed 178 tests (14 transport, 164 workflow). It exercises exact lease expiry, concurrent claims,
role revocation, company/config changes, lost acknowledgements, interrupted applying, prepared
reconnect, bounds, symlinks and owner locks. Typecheck, compile, optional package build, PM index,
PM validation and diff checks passed. No full suite was run locally; CI owns it.

Actual Auth + Functions + Firestore emulator test passed twice, including after changing the
entry config to explicit JSON environment settings. Demo-only guard checks exact project and
endpoints. It verifies ID-token authentication, current Auth role despite stale token claims,
admin direct-write denial, company/profile/connector guards, duplicate enqueue, one fake bridge
invocation and persisted receipt. No native provider launched. Local runtime is Node 26 with
Java 21 and Firebase CLI 15.30.1; the added CI job qualifies Node 22 separately.

Initial emulator discovery did not inherit the arbitrary shell config variable. Changed the
harness to exclusively create its own .env.local mapping and remove only matching owned contents.
It refuses an existing operator env file. A Mac /var versus /private/var alias also exposed an
overly strict journal path comparison; canonicalizing after rejecting a directory symlink fixed
that without removing owner/mode checks. An initial command ran from the wrong directory; no
tracked lockfile changed, and subsequent builds use explicit --dir.

## Remaining qualification

Current emulator bridge is a test double; actual transport-to-HQPool and native worker qualification
follow the reviewed actor seam. No cloud deployment, credential minting, consumer migration or
personal plugin hot replacement occurred. Stale local lock recovery needs exact owner inspection;
unknown bridge effects require observed operation reconciliation. Continuous token renewal,
company-styled UI, live bounded projections, shared occupancy, attachment retention and multiple
companies remain separate rollout work. The old Markdown inbox remains authoritative.


## Independent pre-merge review

Independent high-risk review conditionally cleared one substantive UUID delivery/reconnect mismatch and one minor lease-documentation ambiguity. Fixed within the reviewer-named four paths; uppercase and case-only UUID spellings now retain separate safe journal filenames, lost acknowledgements reconnect without re-execution, and original-fence receipt recovery is documented. All prescribed checks passed.

Clock measurement includes the initial reviewer invocation through its returned result, with no author work between. The reviewer set exact condition paths/evidence; no replacement reviewer or self-review. Conditional fix250f7326 is covered. Shared Codex read28% used before review; later global29%. No main-Claude work launched.

```morpheus-review
{
  "version": 2,
  "base": "0b4b6567c4bb343f76c10bd4dd8f06328d1d2f19",
  "reviewed": "3743aa5e1e246c4770c51d1f3d3ef64fbe7cc0d0",
  "covered": "250f73261990b60b8f139a6b2638f18a9cd5434a",
  "authorSession": "01a165f2-ad9a-7270-863f-355359913b8c",
  "reviewerSession": "/root/hq_transport_reviewer",
  "risk": "high",
  "elapsedMinutes": 3.54575,
  "timing": {
    "source": "clock",
    "durationMs": 212745,
    "evidence": "Parent clock captured invocation start 2026-10-25T11:17:48.866Z and completed reviewer return 2026-10-25T11:21:21.611Z for /root/hq_transport_reviewer in parent 01a165f2-ad9a-7270-863f-355359913b8c."
  },
  "outcome": "complete",
  "summary": "Independent high-risk review conditionally cleared one substantive UUID delivery/reconnect mismatch and one minor lease-documentation ambiguity. Fixed within the reviewer-named four paths; uppercase and case-only UUID spellings now retain separate safe journal filenames, lost acknowledgements reconnect without re-execution, and original-fence receipt recovery is documented. All prescribed checks passed.",
  "findings": [
    {
      "id": "HQ-R1",
      "severity": "substantive",
      "description": "Connector accepted only lowercase UUID filenames and pending IDs while backend accepted uppercase, allowing one accepted request to poison every pass and strand reconnect receipts.",
      "paths": [
        "scripts/paperclip-hq/connector.ts",
        "tests/paperclip-hq.test.ts"
      ],
      "disposition": "fixed",
      "response": "Validate pending IDs with the same backend UUID schema and hash exact operation IDs for case-safe journal names while preserving stored IDs. Added delivery of uppercase, lowercase and case-only spellings plus uppercase receipt reconnect; no duplicate bridge calls.",
      "condition": {
        "paths": [
          "scripts/paperclip-hq/connector.ts",
          "tests/paperclip-hq.test.ts"
        ],
        "evidence": "Make pending-list and journal-filename validation accept backend-valid UUID cases without altering stored identifiers; prove uppercase plus lowercase delivery once and uppercase saved receipt reconnect without another bridge call. Run focused transport tests, typecheck and optional package build."
      },
      "conditionMet": "pnpm exec vitest run tests/paperclip-hq.test.ts passed16/16; pnpm typecheck passed; pnpm --dir scripts/paperclip-hq run build passed. Diff confined to the four named source/test/document paths. Tests retain exact original operation IDs and verify case-safe filenames and no second bridge call."
    },
    {
      "id": "HQ-R2",
      "severity": "minor",
      "description": "Acceptance wording said expired claimants cannot acknowledge, although a saved receipt may be published under its original applying fence after expiry.",
      "paths": [
        "qa/acceptance/paperclip-hq-transport.md",
        "docs/paperclip-hq-transport.md"
      ],
      "disposition": "fixed",
      "response": "Clarified expired pre-application and replaced claims versus original applying fence receipt publication. Preserved tested recovery behavior.",
      "condition": {
        "paths": [
          "qa/acceptance/paperclip-hq-transport.md",
          "docs/paperclip-hq-transport.md"
        ],
        "evidence": "Clarify original applying-fence receipt recovery after expiry; preserve current receipt behavior."
      },
      "conditionMet": "Both documents distinguish claim expiry from original-fence receipt recovery. Existing exact-expiry recovery test passes as part of16/16 focused transport tests."
    }
  ]
}
```
