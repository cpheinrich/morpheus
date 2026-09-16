---
agent: codex
date: 2026-09-10
roadmap: MO-26-09-10-19.44.46
outcome: review
---

# Declare PR metadata read permissions

The issue-triage automation resumed existing PR #233 for issue #231 in an isolated worktree,
preserving the original author's checkout. The implementation grants contents/read and
pull-requests/read to the reusable job, both Morpheus callers, and both generated callers.
Existing downstream callers must grant the same permissions; the reusable job cannot elevate them.

## Evidence and validation

- Original remote head de679101d96ae552f4e367262a3ea9b4bde25c18 passed node and PM CI;
  conventions reached the checker and failed only because independent-review evidence was missing.
- Frozen-lockfile install, pnpm typecheck, pnpm test, pnpm compile, pnpm morpheus pm index,
  and inbox validation run again before review. Tests assert both generated caller grants.
- No production deployment or credential changes are needed for this workflow repair.
- Issue #231 is linked to the existing roadmap item; no duplicate claim or PR was created.

## Independent review

Independent reviewer /root/review_pr233 completed a high-risk shared-control review in 2.2 minutes. No code defects or substantive findings were found. One minor missing Closes #231 clause was corrected in the PR body; no source changes or second pass were needed. The reviewer verified live read-only token grants, successful PR metadata access, and three focused tests. Existing downstream callers still need their own permission grants. Graph transport was unavailable, so review used direct source inspection.

```morpheus-review
{
  "version": 1,
  "base": "649ac302b197aaa6ed43be139ac40ce3f8b39279",
  "reviewed": "c09a8ea760224d633b908c1836507c6b09591198",
  "covered": "c09a8ea760224d633b908c1836507c6b09591198",
  "authorSession": "01a08ebd-2cd3-7923-a70e-94bf73e90da3",
  "reviewerSession": "/root/review_pr233",
  "risk": "high",
  "elapsedMinutes": 2.2,
  "outcome": "complete",
  "summary": "Independent reviewer /root/review_pr233 completed a high-risk shared-control review in 2.2 minutes. No code defects or substantive findings were found. One minor missing Closes #231 clause was corrected in the PR body; no source changes or second pass were needed. The reviewer verified live read-only token grants, successful PR metadata access, and three focused tests. Existing downstream callers still need their own permission grants. Graph transport was unavailable, so review used direct source inspection.",
  "findings": [
    {
      "id": "PR233-R1",
      "severity": "minor",
      "description": "The roadmap links issue 231 but the PR body omitted its closing clause, causing conventions failure.",
      "paths": [
        "hq/product/roadmap/MO-26-09-10-19.44.46-declare-pull-request-read.md"
      ],
      "disposition": "fixed",
      "response": "Added Closes #231 to the live PR body. No source file changed."
    }
  ]
}
```
