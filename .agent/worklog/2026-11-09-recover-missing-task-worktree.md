---
date: 2026-11-09
roadmap: MO-26-11-09-15.12.47
tags: [engineering]
---

# Recover a missing bound worktree

Issue #430 came from a downstream task that had merged and whose linked checkout had already disappeared. Startup used the saved path as Git's working directory, so a working Git installation reported ENOENT. Startup now identifies the missing checkout. An explicit command from the primary checkout can clear the exact task association for the specified session after the operator verifies the task's disposition. It refuses an existing checkout or mismatched task ID.

The regression uses a real removed Git worktree, starts the affected session before and after recovery, and checks that a second session's binding remains present. Startup, CLI dispatch and cleanup suites passed all 152 tests. Typecheck, compile, PM index and enforced complexity passed.

Independent review found a substantive race in the first implementation. A claim could replace the binding between the final comparison and unlink. Recovery now records a marker keyed to the observed binding contents, and each new binding has its own identity. A replacement remains readable even if it arrives while recovery writes its marker. The focused suites then passed all 153 tests, including the forced interleaving.

The initial high-risk review blocked on a concurrent binding replacement race. The author replaced deletion with a marker for the exact stale binding and tested an interleaving that publishes a new live binding during recovery. The same reviewer cleared the fix, independently reran both recovery tests, and found no further issues.

```morpheus-review
{
  "version": 2,
  "base": "9b43d1ee4ed779b28df013c4f7f20f27cca531f8",
  "reviewed": "83e858651acb1549ff7df1d533e1fe17d97abb66",
  "covered": "d65cec89e4325d787d71ce9d5be334bf618c19a4",
  "authorSession": "01a1c292-3f10-7f40-9f9d-6a426fca2c75",
  "reviewerSession": "/root/review_missing_worktree",
  "risk": "high",
  "elapsedMinutes": 0.7,
  "timing": {
    "source": "clock",
    "durationMs": 42000,
    "evidence": "Controller UTC readings around the initial invocation and its complete blocked verdict: 23:17:27 to 23:18:09 on 2026-11-09."
  },
  "outcome": "complete",
  "summary": "The initial high-risk review blocked on a concurrent binding replacement race. The author replaced deletion with a marker for the exact stale binding and tested an interleaving that publishes a new live binding during recovery. The same reviewer cleared the fix, independently reran both recovery tests, and found no further issues.",
  "findings": [
    {
      "id": "R430-1",
      "severity": "substantive",
      "description": "A concurrent claim or resume could replace the old binding after the check and before unlink, causing recovery to delete the live replacement.",
      "paths": [
        "src/session/tasks.ts"
      ],
      "disposition": "fixed",
      "response": "Recovery writes a marker for the exact observed missing binding; each replacement carries a fresh identity. A forced interleaving test preserves the replacement and the reviewer independently reran it."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "/root/review_missing_worktree",
      "commit": "d65cec89e4325d787d71ce9d5be334bf618c19a4",
      "base": "e8f51de685cd89ba691fc3f6d0ad5a9abd01932f",
      "outcome": "cleared",
      "elapsedMinutes": 0.6333333333333333,
      "timing": {
        "source": "clock",
        "durationMs": 38000,
        "evidence": "Controller UTC readings around the same-reviewer follow-up: 23:20:28 to 23:21:06 on 2026-11-09, with verdict received before the end reading."
      },
      "scopeReason": "Verify the concurrent replacement fix and clean trunk integration.",
      "summary": "Cleared R430-1, with no new findings. Both focused regressions passed and native Git exactly reproduced the integration merge."
    }
  ]
}
```
