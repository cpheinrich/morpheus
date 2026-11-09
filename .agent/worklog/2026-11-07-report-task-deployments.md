---
roadmap: MO-26-11-07-22.16.48
tags: [engineering, devops]
---
# Scheduled task deployment observations

Added optional bounded deployment history to the existing scheduled-task document and canonical
v1 wire. Missing history stays absent. Five unique run IDs, positive safe run/attempt/job IDs,
closed state values, nullable lowercase full SHA and sixteen unique protocol-safe stage IDs
bound the projection. The existing owner-private file reader and reporter pass rows unchanged.
Both deployment timestamps use the sample source clock plus the existing sixty-second tolerance.

The design is a small schema extension and clock check, with no structural change or useful new
relationship diagram. Reused the installed Zod boundary and existing numeric/id/date validators;
no new generic module or dependency. Consumer server acceptance precedes producer activation.
Actual observation times survive successful rereads; invalid acquisition produces an error rather
than new deployment evidence. No runtime, credential, enrollment or deployment changes were made.

## Validation

- `node --test plugins/factory/src/host/reporting/tests/scheduled-tasks.test.mjs`: 6 passed.
- `node --test plugins/factory/src/host/reporting/tests/*.test.mjs`: 95 passed. Scope includes
  the changed protocol's adapters, actual file reader, snapshot isolation and transport/security.
- `pnpm typecheck`: passed.
- `pnpm compile`: passed; no generated runtime change expected for this optional mjs boundary.
- `pnpm morpheus pm index`: passed.
- `morpheus complexity check`: passed, enforce CCN 15/cognitive advisory 15, 21 changed
  functions checked in two measured files; generated dist excluded. Inspected task clock family
  and schema refinements; no finding. Tests cover max counts, malformed/unsafe values, duplicate
  IDs, absent compatibility, all states, exact clock boundary and one millisecond beyond it,
  producer-clock versus newer sample-clock, stale rereads, symlink/mode and file-size rejection.

## Discovery and limits

The exact worktree index was unavailable. Used the primary project's graph as provisional
navigation (generation 2026-11-08T03:42:53Z), checked protocol/source coverage, and read the exact
worktree files directly. Did not install or change host tooling. Initial oversized context reads
were not credited by the hook; after reading the records, explicitly took an assertion receipt
with `MORPHEUS_READ_EVIDENCE=off`. The claim reconciled the preceding scheduled-task item to
shipped in its claim commit. Dependency installs used the unchanged frozen lockfiles locally.

## Review handoff

Independent review has not run: the delegated task explicitly prohibits launching another agent
or delegating further. No self-review record or clearance is claimed. The supervising Codex must
launch an independent reviewer with the prepared packet and finish its record/CI before any
future merge. Keep this PR draft with auto-merge disabled; this task does not authorize merge or
activation. Consumer and producer semantic checks and user-visible rollout acceptance belong to
their owners, not this reusable protocol patch.

Canonical candidate: `plugins/factory/src/host/reporting/protocol.mjs`.
SHA-256: `c4aa3850bbbba5e69c8ff8e8587ea682afd4dbe06798f674245017d48cf1e975`.


## Related author increment — Work drill-down PR links

Before independent review, extended existing GitHub job rows with optional `pullRequests`.
Already-read workflow run references supply same-base-repository evidence via exact full_name
or the exact GitHub API repository URL. Any supplied identities must agree. Malformed numbers
and foreign/conflicting references are filtered out; positive safe integers are deduplicated
before the three-number cap. Missing proof keeps the legacy property absent. No branch/commit
inference, new read/scope, PR title/body, Factory prompt or arbitrary description is projected.
This is a small domain projection reusing existing run records, Set and the Zod wire; no generic
module, new dependency or structural design change. The reporter's source/file handling is unchanged.

Validation on the increment:
- `node --test plugins/factory/src/host/reporting/tests/reporting.test.mjs`: 21 passed.
- `node --test plugins/factory/src/host/reporting/tests/*.test.mjs`: 97 passed.
- `pnpm typecheck`, `pnpm compile`, `pnpm morpheus pm index`, `git diff --check`: passed.
- `morpheus complexity check`: passes; 37 targeted functions in four measured files;
  enforce CCN 15/cognitive advisory 15, dist excluded, no finding. Inspected the base identity,
  PR projection and caller family. Tests assert exact unchanged request paths, absent legacy
  shape, malformed and wrong/conflicting repository evidence, valid name/API URL evidence,
  deduplication/cap, closed wire rejection and exclusion of arbitrary PR text.

The candidate hash above supersedes the initial deployment-only canonical file. No independent
reviewer launched; existing draft #649 remains draft with auto-merge disabled. No runtime,
credential, enrollment, merge or deployment change performed. No clarification remains.


## Independent review clearance

Independent Factory review cleared the exact candidate with no findings. The reviewer passed eight focused schema, clock, legacy, private-file and same-repository PR projection checks and verified the canonical protocol hash. One unchanged installer test in the broader reviewer run could not resolve dependencies in that checkout; the author's installed checkout passed all 97 reporting tests. No implementation fixes or follow-up review were needed.

This clearance supersedes the earlier pending-review handoff state. The reviewer was a fresh
Factory session launched by supervising Codex. Reviewed and covered source remains
`08baca05b6f677f41eb4a4e948484e18a14b7323`; only this named worklog changes afterward.
The verified canonical SHA-256 remains
`c4aa3850bbbba5e69c8ff8e8587ea682afd4dbe06798f674245017d48cf1e975`.
No merge, auto-merge or runtime action is authorized by this evidence finalization.

```morpheus-review
{
  "version": 2,
  "base": "d2d10f84d3e7c162e5d60984da53d9cb7103afe0",
  "reviewed": "08baca05b6f677f41eb4a4e948484e18a14b7323",
  "covered": "08baca05b6f677f41eb4a4e948484e18a14b7323",
  "authorSession": "01a1b9cb-7a67-7320-bdd6-049b9b8e5e3b",
  "reviewerSession": "01a1b9d5-26d1-70e3-968d-f8e770391db2",
  "risk": "normal",
  "elapsedMinutes": 1.9588166666666667,
  "timing": {
    "source": "runner",
    "durationMs": 117529,
    "evidence": "Factory run ae00a1ee-4e7e-4f4d-a2b2-0944cda54060, reviewer session 01a1b9d5-26d1-70e3-968d-f8e770391db2, turn 01a1b9d5-2702-7ad3-95f3-3b89773beb36: transcript task_complete.duration_ms=117529, supplied by supervising Codex."
  },
  "outcome": "complete",
  "summary": "Independent Factory review cleared the exact candidate with no findings. The reviewer passed eight focused schema, clock, legacy, private-file and same-repository PR projection checks and verified the canonical protocol hash. One unchanged installer test in the broader reviewer run could not resolve dependencies in that checkout; the author's installed checkout passed all 97 reporting tests. No implementation fixes or follow-up review were needed.",
  "findings": []
}
```
