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
