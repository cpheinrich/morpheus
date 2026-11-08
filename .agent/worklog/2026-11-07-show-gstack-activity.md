---
roadmap: MO-26-11-07-23.48.25
tags: [engineering]
---

# Show gstack activity in sessions

A lifecycle lookup can discover a skill before the agent decides whether it fits.
Plain output now labels candidates as available and gives a Morpheus fallback for
empty or unavailable routes. The session guide asks the agent to tell the user
when it begins using a skill, skips a considered handoff, and returns to Morpheus.
Existing worklogs and review packets hold evidence when applicable. No new
activity store or execution hook is needed.

Typecheck and 27 focused lifecycle and agent-instruction tests passed. Compile,
roadmap index, complexity, and diff checks passed. The first output change put the
CLI entrypoint over the complexity limit. Extracting the plain renderer restored
compliance and kept the JSON path independent.

## Independent review

Independent review cleared the lifecycle messages and the session guide with no findings. The reviewer independently passed the 27 focused tests and smoke-checked the compiled CLI's opt-out, unmatched route, and JSON output.

```morpheus-review
{
  "version": 2,
  "base": "0060b871fe8bbe4b77ccc0577f251020792b152a",
  "reviewed": "b0be7eea512461f4714bf4ccc6624592eaeef4d1",
  "covered": "b0be7eea512461f4714bf4ccc6624592eaeef4d1",
  "authorSession": "01a1b9eb-8cea-7402-8459-9a9dbda63a89",
  "reviewerSession": "/root/gstack_activity_review",
  "risk": "small",
  "elapsedMinutes": 1.5833333333333333,
  "timing": {
    "source": "clock",
    "durationMs": 95000,
    "evidence": "Author clock immediately before spawning at 2026-11-08T07:50:50Z and actual reviewer completion at 2026-11-08T07:52:25Z."
  },
  "outcome": "complete",
  "summary": "Independent review cleared the lifecycle messages and the session guide with no findings. The reviewer independently passed the 27 focused tests and smoke-checked the compiled CLI's opt-out, unmatched route, and JSON output.",
  "findings": []
}
```
