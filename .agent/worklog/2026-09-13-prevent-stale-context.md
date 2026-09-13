---
roadmap: MO-26-09-13-15.14.54
agent: codex
date: 2026-09-13
---

# Prevent stale context certification

Traced Codex SessionStart through the generated shim to `context brief`, and traced explicit
refresh through remote observation, receipt creation and the CLI report. The hook deliberately
discards certification and performs no checkout mutation; that trust boundary is sound. The gap is
that refresh records the live trunk SHA without proving the working source contains it, and after
SessionStart there is no previous receipt left to expose the missing commits.

Implemented native-Git source alignment before receipt creation. A clean trunk fast-forwards but
receives no receipt until the changed files are re-read and refresh runs again. Dirty trunks, stale
feature branches, divergence and fetch failures fail closed without rewriting work. Added real Git
lifecycle tests and updated architecture, project instructions, and scaffolded instructions. A
registry search found no reason to replace the small native Git boundary with a dependency.

Validation: `pnpm vitest run tests/trunk-changes.test.ts tests/session-gate.test.ts` passed the
focused context suite; the final `pnpm test` passed all 1,306 tests. Typecheck, lint, compile, PM
validation/indexing, and `git diff --check` also passed and are recorded in the PR test plan.

## Independent review

The independent reviewer covered `4730896caa203825c04fab7fc108a84fd79631db` at normal risk in
11 minutes. It found one substantive fail-closed defect and one minor lifecycle omission.

- **MO-REV-001 (substantive): accepted.** If invalidating an existing receipt failed, refresh
  could update the source while leaving the old in-term receipt usable. Refresh now invalidates
  before any fetch or fast-forward, and lease reads refuse a store that cannot accept invalidation.
  A real permission-failure lifecycle test proves the checkout stays unchanged and a later guard
  refuses the surviving receipt.
- **MO-REV-002 (minor): accepted.** The roadmap item is in `review` and records PR #243 before the
  final covered SHA is sent for the required same-reviewer follow-up.

The required same-reviewer follow-up reviewed `4349e33427e5ffa7f1185e473cc875fd9413c5f2` for four
minutes. It cleared MO-REV-002 but kept MO-REV-001 substantive: checking only parent-directory
writability does not catch a readable user-immutable lease file. The response now removes the
cross-process assumption entirely—governed actions and `context check` always re-observe the
remote, so an old receipt cannot authorize action after trunk movement even when invalidation
failed. The review contract permits no third agent pass; PR #243 remains draft for human review of
this final resolution.

The initial normal-risk review found one substantive invalidation failure and one minor roadmap
linkage omission. The same reviewer cleared the linkage but blocked the first invalidation fix;
the final remote-reobservation response is validated locally but remains unreviewed because the
contract permits no third agent pass. PR #243 stays draft for human review.

```morpheus-review
{
  "version": 1,
  "base": "0619afad74cf6f8b985735495160f313b524f78e",
  "reviewed": "4730896caa203825c04fab7fc108a84fd79631db",
  "covered": "4349e33427e5ffa7f1185e473cc875fd9413c5f2",
  "authorSession": "/root",
  "reviewerSession": "/root/independent_review",
  "risk": "normal",
  "elapsedMinutes": 11,
  "outcome": "blocked",
  "summary": "The initial normal-risk review found one substantive invalidation failure and one minor roadmap linkage omission. The same reviewer cleared the linkage but blocked the first invalidation fix; the final remote-reobservation response is validated locally but remains unreviewed because the contract permits no third agent pass. PR #243 stays draft for human review.",
  "findings": [
    {
      "id": "MO-REV-001",
      "severity": "substantive",
      "description": "A failed receipt invalidation could leave a prior in-term lease usable by a later governed command.",
      "paths": [
        "src/session/context.ts",
        "src/session/store.ts",
        "src/session/gate.ts",
        "tests/session-gate.test.ts"
      ],
      "disposition": "fixed",
      "response": "Invalidation now precedes source mutation, unwritable stores are refused, and governed actions force remote re-observation so any surviving old receipt loses authority when trunk moved. This final response was made after the permitted follow-up remained blocked and therefore requires human review."
    },
    {
      "id": "MO-REV-002",
      "severity": "minor",
      "description": "The roadmap item had not entered review or recorded its pull request.",
      "paths": [
        "hq/product/roadmap/MO-26-09-13-15.14.54-prevent-stale-context.md"
      ],
      "disposition": "fixed",
      "response": "The item is in review and records PR 243. The same reviewer cleared this finding."
    }
  ],
  "followUp": {
    "reviewerSession": "/root/independent_review",
    "commit": "4349e33427e5ffa7f1185e473cc875fd9413c5f2",
    "outcome": "blocked",
    "elapsedMinutes": 4,
    "summary": "The roadmap linkage was cleared, but directory writability did not cover a readable user-immutable lease file, so the invalidation finding remained substantive."
  }
}
```
