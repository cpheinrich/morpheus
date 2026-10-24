# Human override of an incomplete review — 2026-10-15

Issue #248's legacy `review-waived:` confusion was resolved earlier; this task addresses the
remaining case where an honest `incomplete` independent-review record cannot be merged even after
Chris accepts its limits. Chris approved a documented human-requested override and an explicit
GitHub marker.

The implementation uses a `review-override` label and a comment authored by a configured human.
The comment names the full current PR head, the exact measured budget overrun and a specific
reason for accepting it. Approver authority comes from
protected trunk's committed `morpheus.json`, so a PR cannot add its own approver. The same base
check prevents a PR setting `review.required=false` to waive itself. The reviewer record retains
its incomplete verdict, measured duration, provenance, findings and code coverage. The exception
is reported as a human override, not agent clearance. I created the repository label with a
description explaining the contract.

Dead ends: the codebase-memory installer could not safely stop existing sessions, so I used the
review checker, workflow and focused test sources directly. The one permitted local full-suite run
passed 2,202 of 2,203 tests; the remaining scaffold-instructions size test rejected extra prose I
had added. I shortened the scaffold pointer and its focused test then passed. The final CI run
must confirm the entire suite. Focused `tests/local-review.test.ts` and `tests/workflows.test.ts`
passed; `pnpm typecheck`, `pnpm compile` and `pnpm morpheus pm index` passed.

The first independent review blocked clearance on five substantive findings. F01: a disputed
substantive finding could pass with an incomplete final turn; the override now refuses it. F02:
zero or absent timing could pass; every overridden turn now needs positive measured timing, even
on a historical version 1 record. F03: the Manager's alternate checker could accept a PR's own
`review.required=false` change; both paths now read that policy from protected trunk. F04: a
human could remove their comment after a green check; comment edit/delete events now rerun the
existing PR-head conventions job, which reads the current comments. F05: a generic comment could
pass the length check; the comment now has separate review-limit and accepted-risk lines, and
generic approvals are refused. Focused regression tests cover each case.

The second review cleared F01–F04 but found that F05's first correction still accepted generic
review-limit and accepted-risk prose. The override now requires a real measured budget overrun
and the exact duration-versus-ceiling marker derived from the committed review record. A comment
cannot invent or vaguely describe the exception. The accepted-risk line must include a concrete
reason after `because`; focused tests cover an unchanged budget boundary and the first millisecond
over it.

The comment revocation workflow selects the existing metadata run by current PR head SHA and
branch. GitHub's Actions run API returned an empty `pull_requests` array for older metadata runs,
so selecting by that array would have missed a real prior check. This was caught with a read of
the repository's existing runs before finalizing the workflow.

After the correction, `pnpm exec vitest run tests/local-review.test.ts` passed 142/142 and
`pnpm exec vitest run tests/workflows.test.ts tests/manager-review.test.ts` passed 186/186.
`pnpm typecheck` and `pnpm compile` passed. The local full-suite allowance was already spent;
CI will run the complete suite on the corrected commit.

Final-head CI later found one stale scaffold test: it expected the metadata workflow to contain
only the original `pr` job, while the comment-revocation fix intentionally added
`override-comment`. The other 2,208 tests passed. I corrected the expectation to assert both
jobs, the comment events and the new job's permissions; focused `tests/init.test.ts` passed 74/74.
The source implementation did not change. This correction occurred after the third review turn,
Chris authorized one additional same-reviewer turn in his authenticated PR comment; the original reviewer cleared the test-only correction. Current-main conflict resolution remains outside that clearance.

The independent high-risk reviewer initially blocked five substantive gaps. The author fixed all five and the same reviewer cleared the third-turn correction. CI then found one stale scaffold test; Chris explicitly authorized a fourth same-reviewer turn for its test-only correction, which the original reviewer cleared at 74290f6 with 74 focused tests passing and no new findings. This clearance does not cover any later current-main conflict resolution; final-head CI remains required.

```morpheus-review
{
  "version": 2,
  "base": "8dd56cde2eb952ee485b6347072775156a60eaf8",
  "reviewed": "4b717299f2e82038a9a2b5d68da50faa0200d7ed",
  "covered": "74290f6a267f1e0fe903a8a1b476a746cdc3c463",
  "authorSession": "01a13e64-2d9b-7730-abce-2287983ca7aa",
  "reviewerSession": "/root/human_override_review",
  "risk": "high",
  "elapsedMinutes": 1.93275,
  "timing": {
    "source": "clock",
    "durationMs": 115965,
    "evidence": "Reviewer runner task_started 2026-10-16T00:18:00.689Z and task_complete 2026-10-16T00:19:56.654Z in its session log."
  },
  "outcome": "complete",
  "summary": "The independent high-risk reviewer initially blocked five substantive gaps. The author fixed all five and the same reviewer cleared the third-turn correction. CI then found one stale scaffold test; Chris explicitly authorized a fourth same-reviewer turn for its test-only correction, which the original reviewer cleared at 74290f6 with 74 focused tests passing and no new findings. This clearance does not cover any later current-main conflict resolution; final-head CI remains required.",
  "findings": [
    {
      "id": "F01",
      "severity": "substantive",
      "description": "A disputed substantive finding could pass through an incomplete final-turn override.",
      "paths": [
        "src/review/local.ts"
      ],
      "disposition": "fixed",
      "response": "The override now refuses disputed substantive findings as well as unresolved ones. The reviewer cleared this in the second turn."
    },
    {
      "id": "F02",
      "severity": "substantive",
      "description": "Zero or missing timing evidence could pass a human override.",
      "paths": [
        "src/review/local.ts"
      ],
      "disposition": "fixed",
      "response": "Every overridden turn now requires positive measured timing, including historical version 1 records. The reviewer cleared this in the second turn."
    },
    {
      "id": "F03",
      "severity": "substantive",
      "description": "The Manager review path could accept a PR's own review.required=false opt-out.",
      "paths": [
        "src/review/manager.ts",
        "src/review/local.ts"
      ],
      "disposition": "fixed",
      "response": "Both review paths now require the protected base to have opted out before disabling review. The reviewer cleared this in the second turn."
    },
    {
      "id": "F04",
      "severity": "substantive",
      "description": "Editing or deleting a human approval comment after a green check did not recheck the PR head.",
      "paths": [
        ".github/workflows/review-metadata.yml",
        "src/init/templates.ts"
      ],
      "disposition": "fixed",
      "response": "Comment edits and deletions rerun the existing PR-head conventions job. The run lookup was checked against this repository's GitHub metadata and the reviewer cleared it in the second turn."
    },
    {
      "id": "F05",
      "severity": "substantive",
      "description": "Generic human comment prose could pass as an explanation of the review limit and accepted risk.",
      "paths": [
        "src/review/local.ts",
        "docs/runbooks/independent-review.md"
      ],
      "disposition": "fixed",
      "response": "The review-limit line now has to equal the measured budget overrun derived from the committed record, and only a real overrun qualifies. The reviewer reproduced rejection of the generic comment and cleared the final diff in the third turn."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "/root/human_override_review",
      "commit": "ab44f137cf4a1922c4a197db2b8c3cca93da727b",
      "outcome": "blocked",
      "elapsedMinutes": 1.1949666666666667,
      "timing": {
        "source": "clock",
        "durationMs": 71698,
        "evidence": "Reviewer runner task_started 2026-10-16T00:26:59.135Z and task_complete 2026-10-16T00:28:10.833Z in its session log."
      },
      "summary": "F01–F04 cleared. F05 remained blocked because generic review-limit and accepted-risk text still passed."
    },
    {
      "reviewerSession": "/root/human_override_review",
      "commit": "249285c8c0e4396650679d619df7734aaef10818",
      "outcome": "cleared",
      "elapsedMinutes": 0.4797,
      "timing": {
        "source": "clock",
        "durationMs": 28782,
        "evidence": "Reviewer runner task_started 2026-10-16T00:32:31.846Z and task_complete 2026-10-16T00:33:00.628Z in its session log."
      },
      "summary": "F05 cleared: the old generic comment is rejected, the checker derives the exact budget marker from recorded timing, and the boundary at the ceiling has no override limit. No substantive issue in the final diff."
    },
    {
      "reviewerSession": "/root/human_override_review",
      "commit": "74290f6a267f1e0fe903a8a1b476a746cdc3c463",
      "scopeReason": "Inspect the late test-only correction to the scaffold metadata workflow expectation and its worklog explanation after the previous clearance.",
      "humanAuthorization": {
        "approvedBy": "cpheinrich",
        "approvedAt": "2026-10-24T00:08:13Z",
        "reason": "Chris explicitly authorized one additional same-reviewer turn for commit 74290f6 in https://github.com/cpheinrich/morpheus/pull/414#issuecomment-6377285624."
      },
      "outcome": "cleared",
      "elapsedMinutes": 1.0144333333333333,
      "timing": {
        "source": "clock",
        "durationMs": 60866,
        "evidence": "Original reviewer session runner task_started 2026-10-24T00:09:50.198Z and task_complete 2026-10-24T00:10:51.064Z in its session log."
      },
      "summary": "The original reviewer cleared the test-only correction at 74290f6, ran tests/init.test.ts with 74 passing tests, and found no new issue. This turn did not review current-main conflict resolution."
    }
  ]
}
```
