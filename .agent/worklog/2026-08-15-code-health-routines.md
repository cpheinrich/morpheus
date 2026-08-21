---
date: 2026-08-15
roadmap: MO-26-08-15-01.34.00
outcome: shipped
---

# Proposing code-health routines

A design only — no routine, no workflow, no CLI surface. What is worth recording is the reasoning
that shaped it, because most of it argues *against* the obvious version.

## The headline number is the constraint, not the endorsement

The prior art reports 388 pull requests and 180 merges. It is easy to read that as "this works" and
copy the shape. Read the other way it says **208 pull requests were opened for a human to reject**,
and that is the resource this company has least of. The entire design is downstream of taking the
second reading seriously:

- one pull request per routine per *run*, not per finding
- merge rate as an automatic, reported kill switch
- stage 0 that opens nothing at all until a week of findings has been read

Without those, the honest prediction is that the fleet produces a lot of motion, Chris stops
reading routine pull requests within a fortnight, and the habit of reading them does not come back.

## It would have reversed a live decision by the back door

§7.8 makes the heartbeat a dispatcher and leaves dispatch off — deliberately, and not for want of a
credential: nobody has read a week of beats to see whether the ranker picks what Chris would pick.
Routines are doers on a timer, which is the thing that decision defers.

The resolution is not to argue the decision away. It is that routines are a **separate surface with
a separate budget** that never touches the feature lane, and that they climb the same
evidence ladder dispatch is still on. If routines had quietly shared the heartbeat's ceiling, the
first busy week would have made maintenance and features compete for the same lanes, and the
compromise would have been made by whichever ran first.

## What Morpheus can do that a generic fleet cannot

The prior-art catalogue is entirely about code. Morpheus has a written specification and a scaffold,
so it can diff a project against *what it was supposed to be*: convention drift, deviation drift,
record drift. Evo was three scaffold generations behind and carried an undeclared
`output: "export"` deviation for months. Both surfaced this week as blocked work, expensively, and
both are exactly what a routine would have raised as a diff.

That is the argument for machinery over one-off scripts, and it is worth more than the dead-code
remover everyone would build first.

## Deliberately not decided

Cadence, the merge-rate floor, whether routine pull requests get rung 2 at all (agent-written and
agent-reviewed is thin independence for a doubled bill), and whether a proven routine class may
ever auto-merge on green CI. That last one is where this stops being a proposal about tidiness and
becomes one about unattended agents merging to `main`, so it is named and left open rather than
smuggled in as an obvious next step.

Writing implementation before those are answered would have encoded guesses about all three — the
same mistake `morpheus init` avoided by being built after two retrofits rather than before.

## Proposal V2 — a periodic technical-health audit

The proposal above is **Proposal V1** and remains intact as the record of the first framing. This
V2 refines it after live discussion: V1 over-focused on narrow routines and pull-request throughput.
The primary concept is instead a periodic, codebase-wide technical-health audit — closer to a
virtual CTO review than to a fleet of daily cleanup bots.

Begin **monthly**. The first two or three audits are **report-only**, so usefulness can be calibrated
against what a human actually finds worth acting on before the audit earns permission to change
anything. The cadence creates a deliberate **audit day** rather than a background stream of small
interruptions.

Each audit should produce one review package:

- an executive summary of the codebase's technical health
- ranked findings, each with evidence, confidence, impact, and a concrete next action
- optionally, a bounded and linked batch of focused pull requests, but only where the changes are
  coherent, high-confidence, low-blast-radius, and reversible

An audit is successful when it improves understanding and prioritisation. It is **not required to
create code or pull requests**.

The audit may examine dead code and assets, unused dependencies, obsolete files and configuration,
a duplicate-code inventory, test and CI hygiene, and structural or convention drift. Duplicate-code
work should usually remain report-only at first: identifying similarity is much easier than knowing
whether two paths ought to share one abstraction.

The initial action boundary is deliberately narrow. Architecture redesign, broad performance work,
dependency upgrades, security-policy changes, and judgment-heavy consolidations become
recommendations, not automatic modifications. Urgent security or production-risk findings do not
wait for audit day; continuous guardrails should surface them immediately, outside the monthly
cadence.

Long term, the durable architecture is a **repository-owned, provider-neutral audit contract** plus
a reusable GitHub Action that supplies scheduling, evidence, and artifacts. **Codex is the
recommended initial executor**, but the provider is an implementation detail rather than part of
the contract.

This remains a proposal only. At this stage it adds no workflow, scheduler, CLI command,
credentials, automatic pull-request creation, or other enabled automation. Those are later
implementation decisions, after the report-only audits have established that the review package is
useful.
