---
date: 2026-07-31
agent: claude
roadmap: MO-010
outcome: shipped
summary: Restructured architecture.md into five parts, stripped the changelog and the argument, corrected three places where the spec had drifted from the code
---

## What was done

`architecture.md` went from 2048 to ~1460 lines, reorganised from 27 flat sections into five parts:
orientation → the shape of a project → how work happens → the system → building Morpheus. A
first-time reader now meets the structure and tool choices before the operating model, and the
subsystem detail last.

Stripped, per the item:

- **§26 Resolved** — a 38-line changelog of decisions. Every row is stated in its own section; the
  table was a second copy that could disagree.
- **The "Draft 2, under active iteration" banner** and the `[open]` marker convention.
- **Conversational residue** — "you were right that", "revised from draft 2", "the positioning you
  responded to", "confirmed as intended", "your instinct is right", "exactly the shape you
  described".
- **Argument against never-adopted alternatives.** PostHog self-hosting went from 14 lines of
  rebuttal to 4 lines stating the decision and the three facts behind it. Vercel-vs-Firebase App
  Hosting went from 28 to 12. The "What Next.js is (and Angular)" explainer was cut entirely — it
  teaches web frameworks rather than stating an architecture decision.
- **Answered open questions.** Q2 (cross-project rollup) is answered in §19.3, and Q9 was already
  answered by the Vercel decision. Seven remaining questions renumbered Q1–Q6.

Kept, per the item: every decision with a one-line reason, the genuine open questions in one
section at the end, and the hard-won gotchas — now marked as `> **Gotcha.**` blockquotes attached
to the subsystem they bite in, rather than collected far from their context.

## Verification that no decision was lost

The deleted §26 Resolved table is an index of every major decision, which made it a ready-made
checklist. Extracted 49 decisions from it plus the surrounding sections and grepped the rewritten
document for a distinctive phrase from each. 49/49 present.

Worth recording: one check reported a false negative — `zero egress` did not match because the
phrase had been line-wrapped as `zero\negress`. A naive substring grep across a reflowed document
will under-report. Confirmed by hand.

## Three drift corrections

These are factual fixes, not simplifications, and are the part most worth a second pair of eyes.
The doc claims to be more current than the code; in these three places the code was more current.

1. **§12.4 agent memory described `.agent/journal/`, `.agent/status/`, and `hq/STATUS.md`.** The
   shipped layout is `.agent/worklog/`, `.agent/inbox-archive/`, `.agent/decisions.md`,
   `.agent/learned.md`, and `hq/inbox/<handle>.md`. Rewritten to match `.agent/README.md`,
   including the two-raw-logs-feeding-two-distillations structure, which the old text did not
   describe at all.
2. **§21.2 schemas used `RM-\d{3,}` and `G-\d{4}-...`.** Ids are project-prefixed —
   `src/pm/schema.ts` has `/^[A-Z]{2,4}-\d{3,}$/`, `/^[A-Z]{2,4}-G-\d{4}-(Q[1-4]|ANNUAL)-\d{2}$/`,
   and `/^[A-Z]{2,4}-FR-\d{3,}$/`. Copied the real patterns in.
3. **§24.1 said `"kind": "internal-tool"`**, contradicting §3 and this repo's own `morpheus.json`,
   both of which say `internal`. Corrected.

## The length target, and why it was not met

The item asks for "roughly half the current length with no loss of decisions." The result is a 29%
reduction, not 50%.

Measured composition of the rewritten file: 44% prose, 22% fenced code and Mermaid, 12% tables, 22%
blank. Reaching 1024 lines from 1459 would mean cutting ~435 more lines, and after the prose pass
the remaining bulk is the reference material — the runtime diagram (50 lines), the manifest example
(35), the business-function index (33), the bootstrap tier table, the token-ownership table. Those
are decisions in reference form, and deleting them would trade the constraint for the target.

So the target was treated as the softer of the two. Flagged in the PR rather than quietly missed;
if the reference tables are considered fair game, a second pass gets much closer.

## Dead end worth recording

Started by trying to compress in place, section by section, keeping the 27-section order. That
produced shorter sections that still read as a transcript, because the *ordering* was the problem —
the document opened with what Morpheus is, then jumped to project structure, then to a tool table,
then back to analytics philosophy. Compression could not fix a reader arriving at §8 without having
been told how work happens. Restarted with the five-part structure, which is what the item's
"restructure rather than edit in place" was pointing at.

## Also cleared

`pm claim MO-010` failed on `fatal: a branch named 'mo-010-...' already exists` — a stale *local*
branch left from PR #31, the inbox cycle that borrowed this item's branch. Verified it held only
that cycle's two commits and never touched `architecture.md`, then deleted it.

Worth noting as a possible item: `pm claim` surfaces this as a raw git error. It already refuses
when *origin* has the branch, with a good message; a stale local branch gets an unhelpful one. 28
more such branches exist in this repo and will hit the same wall.
