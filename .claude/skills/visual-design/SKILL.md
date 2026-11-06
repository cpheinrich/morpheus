---
name: visual-design
description: Sketch and show a design early, before implementation, when relationships clarify architecture, workflows or pipelines, async handoffs, state transitions, ownership, or substantial design alternatives. Skip trivial self-contained edits.
---

# Visual design planning

Use a diagram during planning when it makes the design easier to reason about. Create and show
the first useful sketch before implementation, while choices can still change. A typo, isolated
copy edit, or straightforward local fix usually needs no diagram or explanation for skipping one.

1. Identify the relationship or decision the reader needs to understand. Inspect relevant source
   and records; distinguish the **current** system from the **proposed** change. Label assumptions
   and unknowns rather than drawing them as established facts.
2. Draw the smallest useful view. Prefer a flowchart for architecture, dependencies, ownership or
   a pipeline; a sequence diagram for async handoffs and ordering; a state diagram for transitions;
   or comparable side-by-side views for substantial alternatives. Label meaningful edges and
   boundaries, including failure/retry paths when they affect the decision. Avoid exhaustive maps.
3. Render and show it in the conversation or an accessible preview, with a short explanation of
   the decision and tradeoff. Do not deliver only a source path. Use the environment's Mermaid
   rendering when available; otherwise render a preview and inspect it. If rendering is unavailable,
   show the diagram source inline and state that limitation without stalling useful work.
4. Take a quick simplification pass, then continue implementation under the existing authority.
   Update any retained diagram after a material design change so it describes the final design.

For durable repository documentation, use fenced Mermaid consistent with Morpheus architecture.md
section 15, beside the explanation it supports. Ephemeral sketches may stay in the conversation;
promote them only when they will help future readers. Keep private project details in their own
authorized records.

This is planning guidance: it adds no mandatory approval pause, merge gate or diagram requirement
for every task. During review, ask whether a diagram would help and whether retained diagrams are
useful and accurate. Missing or cosmetic diagrams are advisory notes; a substantive design
inaccuracy is handled under the ordinary correctness and documentation review rules.
