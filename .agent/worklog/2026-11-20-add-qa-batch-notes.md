---
date: 2026-11-20
roadmap: MO-26-11-20-13.23.42
tags: [engineering, qa]
---

# Add batch notes to QA feedback tools

The simulator and web overlays now keep optional Notes in the tab draft and send
it at batch level. The production web panel freezes the notes with the batch ID
so a retry resends the same content. Local batches expose notes to both the
interactive QA skill and its independent serial responder. Existing batches are
compatible with the optional field.

This supplies the shared UI and schema. Each live site owns its persistence
adapter and dependency revision. Native iOS QA and the automatic dispatcher
are maintained in Evo.

Validation covered the 2,000-character boundary, browser reload, ambiguous retry,
and successful send. Typechecking, compilation, 151 focused unit tests and 50
browser tests passed. Eight affected browser cases passed after the final
visual adjustment.
