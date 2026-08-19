---
date: 2026-08-19
roadmap: MO-26-08-19-15.34.01
agent: claude
---

# Reviews are acted on before merge

## The finding that started it

Chris asked how to stop a PR merging past an unread or in-flight review. Reading the actual branch
protection made it worse than asked: **Morpheus's `main` required zero status checks** — any PR
could merge with CI red or still running — and `learned.md`'s "auto-merge fired on a stale head"
entry is exactly what zero required checks produces. Evo required `web` and `pm` only. Neither
repo required conversation resolution.

## The design line

The settled decision — rung 2 does not block — forbids the review's *verdict* gating the merge.
It says nothing against the *process* gating it. So: enforce that the review finished and that
every finding was visibly dispositioned, never that the reviewer was happy.

- **Conversation resolution** (native protection) is the disposition mechanism, and it only became
  possible yesterday when findings moved inline — each finding is now a resolvable thread.
- **`agent-review / delivery` becomes a required check** and now *fails* on a requested,
  configured, undelivered review, where it used to warn and pass. Because it `needs: review`, an
  in-flight review holds it pending, which is what actually stops `--auto` mid-review.
- **`review-waived: <reason>`** in the PR body is the pressure valve, reusing `waiverReason` +
  `isRealReason` from `check pr` — one definition, third consumer. Read at verification time, so
  the recovery when the reviewer is down is: edit the body, re-run the job.

## Judgment calls worth recording

**The waiver never relabels a delivery.** `reviewDelivery` checks the waiver only after the
assessment fails, and reports `waived:` as its own outcome the workflow renders distinctly. A
waiver that could upgrade an undelivered review to "confirmed" would be the silent substitution
this whole rung keeps guarding against; a delivery that ignores a stale waiver line means a body
carrying `review-waived:` from a past outage cannot quietly exempt every future run — it only
speaks when the review actually failed to arrive.

**An unreadable PR body is no waiver.** Fail closed: a waiver that cannot be verified must not be
honoured — the same rule as the unreadable comment snapshot one function up.

**The skipped-equals-satisfied property is load-bearing.** Records-only PRs, unconfigured repos
and `synchronize` pushes all leave the delivery job *skipped*, and GitHub treats a skipped
required check as satisfied. That is what lets one required-check name serve repos with and
without the rung, and PRs the rung deliberately ignores.

**The accepted seam:** a push during the previous commit's in-flight review carries its own
skipped delivery check, so a merge inside that minutes-wide window can outrun the reviewer.
Closing it means reviewing every push — the bill already declined. Named in architecture §9
rather than hidden.

## Rung 2 caught the design's fatal flaw before the settings did

The first shape of this change kept `ci.yml`'s caller-level `if:` and required
`agent-review / delivery`. The reviewer's inline finding: **a caller-level skip leaves the nested
delivery check *unreported*, not skipped** — and an unreported required check blocks the merge
forever. The evidence was already in this session's own transcript: the fix-push to #134 showed a
single check named `agent-review` (the skipped caller), with no `agent-review / delivery` row at
all. Had the settings been applied against that shape, the first `synchronize` push would have
frozen its PR with no recovery path.

The fix moves the once-per-PR decision inside the reusable workflow: the caller always runs, a new
`synchronize-reviews` input (default false) short-circuits the gate before any money is spent, and
the delivery job's *job-level* skip is reported as skipped — which satisfies a required check. The
economics are unchanged; the check is now always reported. Per-push reviews remain one input away
for any consumer that wants them.

Second finding, same review: `waiverReason` read the raw PR body, so a fenced or backticked
`review-waived:` example would have waived the required check it documents. `closesIssue` already
strips comments and code for exactly this reason — that composition is now exported as
`visibleProse` and both the delivery waiver and `check pr`'s new review-waived reporting read
through it. The sibling looseness — `skip-tests:` and `records-only:` still read raw — is
pre-existing, milder (it self-waives conventions, not a required check), and deliberately not
changed here.

## Verification

Typecheck, 937 tests (13 new: five waiver behaviours on `reviewDelivery`, two workflow guards).
The workflow guard was verified by breaking its subject — restoring the delivery step's
final `exit 1` to a warning fails `fails on a non-delivery, and honours a spoken waiver`.

Branch protection itself is a setting, not a file: applied by hand after merge (both repos), and
its intended shape is recorded in architecture §9. The end-to-end proof is this PR's own review —
delivery must pass as a *check that can now fail*, and any inline finding must physically block
the merge until resolved.
