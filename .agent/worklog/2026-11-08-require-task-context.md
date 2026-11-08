---
date: 2026-11-08
roadmap: MO-26-11-08-00.21.37
tags: [engineering]
summary: "Cue and verify task retrieval in bounded startup."
---

The required core and task evidence serve different purposes. The prompt
hook cues search before implementation. The freshness gate checks that a
tool result actually contained a current, cited task excerpt before a
governed action. The exact-path command uses the same evidence format.
Full startup and clients with no working hook pair use their existing gate.
Local state stores session hashes and markers, without prompt or result text.

The focused suite exercises the cue, session isolation, empty or truncated
output, core exclusion, exact-path reads and the existing receipt backstop.
The first installer run flagged outdated event expectations. Updated those
expectations to cover the new hook for both providers.

The compiled CLI smoke test ran against an isolated tracked project with
both Tantivy and ripgrep. In each arm, the prompt hook emitted the cue,
`pm new` refused despite a fresh core receipt, and the same command
succeeded after the post-tool hook received the search result. The
focused suite passed 186 tests, including the native Tantivy cases.

Independent review reproduced two edge cases. The first lookup now
follows a session into a linked worktree, where the visible excerpt is
checked against that checkout. If the manifest or sparse checkout leaves
no usable task record, the prompt points to coverage and the existing
core gate remains usable. Both regression tests pass. The focused
follow-up covered 156 tests. The two-engine compiled CLI probe still passes.

For a bound worktree that predates rollout, the cue and backstop now
select the bounded caller, where the same evidence rules apply. The
mixed-policy regression passes. The final focused suite passed all 189 tests.

Independent review cleared the task gate after fixing worktree handoff, empty corpus recovery and mixed rollout policies.

```morpheus-review
{
  "version": 2,
  "base": "6ac6063a1e7caa910c916c1effd1678528f2317d",
  "reviewed": "b0833ce137883ec75c7f80c1efedcbf45ac4acf8",
  "covered": "41d51bfa694351bf235949225d348ab93c27b207",
  "authorSession": "01a1b4d0-b0d9-7cd1-9f03-33349cd7f590",
  "reviewerSession": "/root/task_context_reviewer",
  "risk": "normal",
  "elapsedMinutes": 2.6203166666666666,
  "timing": {
    "source": "runner",
    "durationMs": 157219,
    "evidence": "Root runner transcript, reviewer invocation/result timestamps 08:29:38.803 to 08:32:16.022 UTC."
  },
  "outcome": "complete",
  "summary": "Independent review cleared the task gate after fixing worktree handoff, empty corpus recovery and mixed rollout policies.",
  "findings": [
    {
      "id": "TC-1",
      "severity": "substantive",
      "description": "Changing to a bound worktree bypassed the pending lookup and could strand the original checkout.",
      "paths": [
        "src/context-search/task-start.ts"
      ],
      "disposition": "fixed",
      "response": "Discover task evidence across registered worktrees. Verify the actual excerpt against its supplying checkout. A linked-worktree regression covers both the refusal and clearing search."
    },
    {
      "id": "TC-2",
      "severity": "substantive",
      "description": "A bounded checkout with no task records beyond the core could not clear the gate.",
      "paths": [
        "src/context-search/task-start.ts"
      ],
      "disposition": "fixed",
      "response": "Fall back to the core when no nonempty task source is readable, with a coverage message and regression for an exclusion-only project."
    },
    {
      "id": "TC-3",
      "severity": "substantive",
      "description": "A bounded caller could point the agent to an older worktree that cannot supply qualifying evidence.",
      "paths": [
        "src/context-search/task-start.ts"
      ],
      "disposition": "fixed",
      "response": "Use a bounded caller when the bound worktree predates rollout. The same mixed-policy test verifies the cue, refusal and clearing read."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "/root/task_context_reviewer",
      "commit": "deef230653a32e84d9faccde2458598b36d20151",
      "outcome": "blocked",
      "elapsedMinutes": 0.8956333333333333,
      "timing": {
        "source": "runner",
        "durationMs": 53738,
        "evidence": "Root runner transcript, reviewer invocation/result timestamps 08:33:08.264 to 08:34:02.002 UTC."
      },
      "summary": "Original handoff and corpus cases cleared. A worktree with an older rollout policy still caused a refusal loop."
    },
    {
      "reviewerSession": "/root/task_context_reviewer",
      "commit": "41d51bfa694351bf235949225d348ab93c27b207",
      "outcome": "cleared",
      "elapsedMinutes": 0.24616666666666667,
      "timing": {
        "source": "runner",
        "durationMs": 14770,
        "evidence": "Root runner transcript, reviewer invocation/result timestamps 08:34:40.986 to 08:34:55.756 UTC."
      },
      "summary": "The mixed-policy lookup clears the gate. All five focused task-start tests passed."
    }
  ]
}
```
