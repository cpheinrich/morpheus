---
roadmap: MO-26-09-13-17.08.15
---

# Task worktrees and current startup source

The user clarified one worktree per implementation task, rather than one per conversation.
The initial local per-session allocation prototype was replaced before publication. Startup now
fetches canonical trunk and fast-forwards only clean local trunk; dirty and active checkouts
remain intact. Explicit refresh refuses source that does not contain observed trunk.

New claims prepare a fresh detached checkout when necessary, move only new untracked intake,
and require the agent to read and certify the destination before the actual claim. Explicit
resume reuses a claimed task's worktree or checks out its remote branch. Optional provider session
associations retain claimed and prepared tasks across continuation, validating repository and
branch identity. Hook output gives an absolute directory because a subprocess cannot change the
parent agent's working directory.

Superseded draft PR #243 was closed and remote branch
`mo-26-09-13-15.14.54-prevent-context-receipts` deleted at the user's explicit request. Its issue
#242 is carried by this item and closed by the replacement PR.

## Validation and rollout

Real-Git tests exercise clean/stale/dirty/diverged checkouts, declared upstream, failed fetch,
offline behavior, source receipt refusal/invalidation, new intake movement, actual claim/push,
missing receipt refusal, pending session association, local task reuse, remote-only task recovery,
and ambiguous/stale identity refusal. The full Vitest suite, typecheck, lint, compilation and PM
index checks are required before publication. No iOS suite or visual product surface is changed.

All ten local primary Morpheus project repositories have both provider hooks calling
`sh .morpheus/session-start.sh`, and all shims dispatch to `morpheus context brief`. Consequently
this behavior reaches them through the copied global CLI without hook JSON edits or renewed hash
trust. Existing provider trust cannot be proved from file presence. This device has consented
CLI auto-update enabled. After merge, update the standalone CLI from reviewed main and verify
its receipt plus a real startup invocation. Other devices receive it through consented update hooks
or `morpheus self update`; runtime dependency updates alone do not update the global CLI.

The native Git and Node primitives were retained after checking simple-git 3.36.0's maintained
registry metadata and five direct dependencies; this lifecycle is Morpheus-specific.

Graph-first discovery identified the context, session bootstrap, install and claim paths; coverage
for those original paths had no recorded issues at generation 2026-09-11T17:28:18Z. The exact task
checkout was then indexed by the trusted-device installer, but this session's MCP transport closed
on its restart. Further verification used exact source reads and tests; no graph completeness claim
is made for the new modules.

## Independent review

Independent review found one substantive source-certification gap: switching to an older branch with identical records could re-anchor a fresh receipt onto stale code. The author added local source containment before cached acceptance and re-anchoring, with tests for older branches, same-branch resets and failed refusal persistence. The same reviewer cleared the fix in the one permitted follow-up. No findings remain unresolved; review used exact source because graph metadata was stale.

```morpheus-review
{
  "version": 1,
  "base": "0619afad74cf6f8b985735495160f313b524f78e",
  "reviewed": "88ca0ec718130a45faf3b9c0cf64252dc3355771",
  "covered": "375342e9c9e114070459d6a1846d3aec5d3daaa5",
  "authorSession": "01a09d3c-52ce-7852-8288-4659a18309ab",
  "reviewerSession": "/root/independent_review",
  "risk": "high",
  "elapsedMinutes": 8,
  "outcome": "complete",
  "summary": "Independent review found one substantive source-certification gap: switching to an older branch with identical records could re-anchor a fresh receipt onto stale code. The author added local source containment before cached acceptance and re-anchoring, with tests for older branches, same-branch resets and failed refusal persistence. The same reviewer cleared the fix in the one permitted follow-up. No findings remain unresolved; review used exact source because graph metadata was stale.",
  "findings": [
    {
      "id": "R01",
      "severity": "substantive",
      "description": "Reviewer R1: check() could re-anchor a current receipt onto an older branch with identical canonical records but missing a code-only trunk commit.",
      "paths": [
        "src/session/context.ts"
      ],
      "disposition": "fixed",
      "response": "Added local source containment before the in-term shortcut and fresh re-anchoring. Repeated reads reject regression even if writing the refusal fails. Tests cover an older branch, same-branch reset and failed persistence; the existing offline-cache fixture now uses a real commit."
    }
  ],
  "followUp": {
    "reviewerSession": "/root/independent_review",
    "commit": "375342e9c9e114070459d6a1846d3aec5d3daaa5",
    "outcome": "cleared",
    "elapsedMinutes": 0.4,
    "summary": "R1 resolved; cached certification and re-anchoring both require source containment. Inspected source, documentation and generated JavaScript; 78 focused tests passed. No additional findings."
  }
}
```

Final author validation: 1,319 tests passed across 47 files; typecheck, lint, compilation,
PM index and diff checks passed. The standard shim also passed against a deliberately behind
real Git clone: exact updated HEAD, one checkout, hook session ID parsed, and no receipt minted.
