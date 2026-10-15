---
date: 2026-10-15
agent: codex
roadmap: MO-26-10-15-00.45.12
outcome: review
summary: Stop repeated identical trunk rescue PRs while keeping the reset proof and preserving distinct edits.
---

# Repeated trunk rescue edits

Morpheus #399 describes seven Evo rescue draft PRs in 36 hours after Xcode
re-saved the same project or scheme diff on an open trunk checkout. Evo has
fixed its Xcode file format, but the rescue needed to recognize recurrence
for any project. The existing rescue was lossless; its gap was repeated
publishing and human escalation.

The new check compares exact Git diffs against locally visible
`wip/trunk-*` branches. It uses old/new blob IDs, paths and modes; Git's
whitespace-insensitive `patch-id` was considered but rejected because
different edits could collide. A duplicate requires the branch to still exist
at the same SHA on the push remote and have an open GitHub PR. A duplicate retains the existing proof,
rechecks the working tree immediately before reset, skips a new branch,
push and PR, and prints the earlier PR plus a generator-loop hint.
Local-only branches, failed PR creation and failed lookups use the ordinary rescue.

Focused validation: `pnpm exec vitest run tests/trunk-rescue.test.ts
tests/session-start.test.ts` passed 55 tests on the final code. They cover recurrence,
distinct whitespace edits, a previous push failure, stale remote branches,
fork PR lookup, closed PRs, and session startup.
The one permitted local `pnpm test` run for shared session code passed
2172 tests across 80 files before the reviewer correction. `pnpm typecheck`, `pnpm lint`,
`pnpm compile`, and `pnpm morpheus pm index` passed. An unrelated
generated Zod enum order flip in `dist/pm/schema.d.ts` was restored after
compile; the session output remains committed.

Codebase-memory could not activate because active sessions could not be
stopped safely. I used targeted source, tests, specification and the Evo
incident description as the fallback.

The initial high-risk independent review found two substantive gaps. A stale
remote-tracking ref could survive remote branch deletion and suppress a new
rescue. A successful push followed by failed PR creation could also suppress
future PR creation. Both are addressed by a live remote SHA check and a
GitHub PR lookup before the working-tree content proof. The focused suites
passed 54 tests after this first correction, including a fork with a distinct
push URL and head owner. The same reviewer found that the installed GitHub CLI
rejects `owner:branch` in `pr list --head`, and that a closed PR must never
count as an active rescue. The final correction uses the plain branch with an
owner check on returned PRs and limits the query to open PRs. Its 55 focused
tests, typecheck, lint, compile, and index all passed. The reviewer conditionally
cleared those two findings with these exact paths and checks; no further review
turn was required. The local full suite already ran once; CI will run it on the
final head.

The independent review found four substantive gaps across two turns. The
first two were fixed and confirmed by the same reviewer. The reviewer
conditionally cleared the last two after the targeted code, test, generated
output, and documentation corrections, all within the listed paths, and the
required checks passed. No finding remains open. Final-head CI is still the
release check.

```morpheus-review
{
  "version": 2,
  "base": "bbc790585807c15d5e0d43ef9fb756a85b9cb01f",
  "reviewed": "bb12937461158ceb1239126cfab2c7a8fbe3cf38",
  "covered": "dbfe8fff8f455b46954c4b78511195ad095667ea",
  "authorSession": "01a13e64-2d9b-7730-abce-2287983ca7aa",
  "reviewerSession": "/root/trunk_rescue_review",
  "risk": "high",
  "elapsedMinutes": 3,
  "timing": {
    "source": "clock",
    "durationMs": 180000,
    "evidence": "clock__curr_time: initial review dispatched 2026-10-15 07:49:58 UTC; completion observed 07:52:58 UTC"
  },
  "outcome": "complete",
  "summary": "The independent review found four substantive gaps across two turns. The first two were fixed and confirmed by the same reviewer. The reviewer conditionally cleared the last two after the targeted code, test, generated output, and documentation corrections, all within the listed paths, and the required checks passed. No finding remains open. Final-head CI is still the release check.",
  "findings": [
    {
      "id": "TR-1",
      "severity": "substantive",
      "description": "A stale remote-tracking ref after remote branch deletion could suppress a new rescue.",
      "paths": ["src/session/trunk-rescue.ts", "tests/trunk-rescue.test.ts"],
      "disposition": "fixed",
      "response": "Require a live branch at the same SHA on the push remote before deduping, and cover the deleted-remote case. The same reviewer confirmed the correction."
    },
    {
      "id": "TR-2",
      "severity": "substantive",
      "description": "A pushed branch whose PR creation failed could suppress another rescue without an active PR.",
      "paths": ["src/session/trunk-rescue.ts", "tests/trunk-rescue.test.ts"],
      "disposition": "fixed",
      "response": "Require a matching GitHub PR before deduping; test the failed-PR path. The same reviewer confirmed the correction."
    },
    {
      "id": "TR-3",
      "severity": "substantive",
      "description": "GitHub CLI rejects owner:branch for pr list --head, so fork PRs could be missed.",
      "paths": ["src/session/trunk-rescue.ts", "tests/trunk-rescue.test.ts"],
      "disposition": "fixed",
      "response": "Use the plain branch in pr list and filter the returned PR's head repository owner. The fork regression rejects owner:branch; 55 focused tests passed.",
      "condition": {
        "paths": ["src/session/trunk-rescue.ts", "tests/trunk-rescue.test.ts", "dist/session/trunk-rescue.js", "dist/session/trunk-rescue.js.map", "architecture.md", "hq/product/roadmap/MO-26-10-15-00.45.12-dedupe-trunk-rescue.md", ".agent/worklog/2026-10-15-dedupe-trunk-rescue.md"],
        "evidence": "Add a fork test that rejects owner:branch. Run focused trunk-rescue and session-start tests, typecheck, lint, compile, and index."
      },
      "conditionMet": "Commit dbfe8fff8f455b46954c4b78511195ad095667ea changed only the conditioned paths. The fork lookup rejects owner:branch and matches the plain branch with owner filtering; focused tests passed 55/55, typecheck, lint, compile, and index passed."
    },
    {
      "id": "TR-4",
      "severity": "substantive",
      "description": "A closed or merged PR with a live branch could be mistaken for active escalation.",
      "paths": ["src/session/trunk-rescue.ts", "tests/trunk-rescue.test.ts"],
      "disposition": "fixed",
      "response": "Restrict the lookup to open PRs and add a closed-PR regression; 55 focused tests passed.",
      "condition": {
        "paths": ["src/session/trunk-rescue.ts", "tests/trunk-rescue.test.ts", "dist/session/trunk-rescue.js", "dist/session/trunk-rescue.js.map", "architecture.md", "hq/product/roadmap/MO-26-10-15-00.45.12-dedupe-trunk-rescue.md", ".agent/worklog/2026-10-15-dedupe-trunk-rescue.md"],
        "evidence": "Add a closed-PR regression that triggers ordinary rescue. Run focused trunk-rescue and session-start tests, typecheck, lint, compile, and index."
      },
      "conditionMet": "Commit dbfe8fff8f455b46954c4b78511195ad095667ea changed only the conditioned paths. A closed PR with a live branch triggers a new rescue; focused tests passed 55/55, typecheck, lint, compile, and index passed."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "/root/trunk_rescue_review",
      "commit": "3a5acaa421708ab431bc0fb739b1b5a7658613f1",
      "outcome": "cleared",
      "elapsedMinutes": 2.466666666666667,
      "timing": {
        "source": "clock",
        "durationMs": 148000,
        "evidence": "clock__curr_time: same-reviewer follow-up dispatched 2026-10-15 07:56:49 UTC; verdict was visible by 07:59:17 UTC when the next focused tests began. This is a conservative upper bound on that turn."
      },
      "summary": "TR-1 and TR-2 were fixed. The reviewer conditionally cleared TR-3 and TR-4 after the specified correction paths and evidence; those conditions were met in dbfe8fff8f455b46954c4b78511195ad095667ea."
    }
  ]
}
```
