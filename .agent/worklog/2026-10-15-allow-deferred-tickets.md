---
date: 2026-10-15
agent: codex
roadmap: MO-26-10-15-00.19.05
outcome: review
summary: Permit a newly filed ticket for a deferred review finding within the conditional-clearance window.
---

# Deferred findings can be ticketed after review

Evo PR #503 exposed a contradiction: the reviewer discovered an incidental
finding and asked for a roadmap ticket, but filing it after `reviewed` made
`review validate` reject the author-only commit. Evo spent a follow-up
review turn and fixed the unrelated issue instead.

The validator now recognizes only a regular, newly added roadmap file whose
id appears on a deferred or open finding. It permits that file between
`reviewed` and `covered`, including after a conditional follow-up. It
still rejects existing-ticket edits, unrelated tickets, the static roadmap
README, source changes outside conditions, and all ticket changes after
`covered`. The runbook and architecture now state this narrow rule.

Focused validation: `pnpm exec vitest run tests/local-review.test.ts
tests/review.test.ts` passed 211 tests, including the positive clearance
case and negative coverage boundaries. The one permitted full local suite
for shared review code passed 2163 tests across 80 files. `pnpm typecheck`,
`pnpm compile`, and `pnpm morpheus pm index` passed. The roadmap README
is deliberately static, so allowing it as a generated index would expose
unreviewed prose; that proposal was rejected after checking both Morpheus
and Evo.

Codebase-memory could not activate because active sessions could not be
stopped safely; exact source, tests, specification and runbook were read
as the fallback.

The initial high-risk independent review found two substantive bypasses. An
ID-prefixed directory with a nested Markdown file passed as a ticket even
though the roadmap parser ignored it. A trunk merge could introduce the
ticket after `reviewed`, and a later author edit to that existing ticket
was then classified as newly filed. Both were reproduced by the reviewer
with disposable Git histories; no GitHub or source writes were made.
The correction requires a direct regular Markdown item with valid roadmap
frontmatter and matching id, and proves its first appearance on the branch
was an author commit. The two exact regression cases now fail under the
original implementation and pass with the correction. The focused review
suites pass 213 tests, and typecheck passes. The single full local suite
was already run before this correction; CI will run it on the final commit.

The same reviewer checked the correction at `3fd9c84bc737177b8663adc54e1d0e0fd0d07487`, independently ran the two targeted regressions, and cleared both original findings with no new actionable findings. Final-head CI remains the release check.

The initial review found two substantive authorization bypasses; the same-reviewer follow-up cleared both after the correction. Final-head CI remains to be verified.

```morpheus-review
{
  "version": 2,
  "base": "dcf08f370c48a9f62a638998633e85e4a29d253c",
  "reviewed": "7864bf3109a50f016730554f71261d714db857ed",
  "covered": "3fd9c84bc737177b8663adc54e1d0e0fd0d07487",
  "authorSession": "01a13e64-2d9b-7730-abce-2287983ca7aa",
  "reviewerSession": "/root/deferred_ticket_review",
  "risk": "high",
  "elapsedMinutes": 2.1166666666666667,
  "timing": {
    "source": "clock",
    "durationMs": 127000,
    "evidence": "clock__curr_time: initial review dispatched 2026-10-15 07:25:57 UTC; completion observed 07:28:04 UTC"
  },
  "outcome": "complete",
  "summary": "The initial review found two substantive authorization bypasses; the same-reviewer follow-up cleared both after the correction. Final-head CI remains to be verified.",
  "findings": [
    {
      "id": "nested-ticket-path",
      "severity": "substantive",
      "description": "An ID-prefixed nested Markdown file could masquerade as a roadmap ticket even though the parser ignored it.",
      "paths": ["src/review/local.ts"],
      "disposition": "fixed",
      "response": "Require a direct regular Markdown roadmap file with valid RoadmapItem frontmatter and matching id; added the nested-path regression test."
    },
    {
      "id": "trunk-introduced-ticket",
      "severity": "substantive",
      "description": "A ticket introduced by a trunk merge after reviewed could be edited by the author and classified as newly filed.",
      "paths": ["src/review/local.ts"],
      "disposition": "fixed",
      "response": "Walk first-parent history and require the ticket's first appearance in an author commit; added the trunk-merge regression test."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "/root/deferred_ticket_review",
      "commit": "3fd9c84bc737177b8663adc54e1d0e0fd0d07487",
      "outcome": "cleared",
      "elapsedMinutes": 1.45,
      "timing": {
        "source": "clock",
        "durationMs": 87000,
        "evidence": "clock__curr_time: same-reviewer follow-up dispatched 2026-10-15 07:31:44 UTC; completion observed 07:33:11 UTC"
      },
      "summary": "Both original findings are fixed; the two targeted regressions passed and no actionable findings remain."
    }
  ]
}
```
