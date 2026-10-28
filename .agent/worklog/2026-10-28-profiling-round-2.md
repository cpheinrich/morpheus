---
date: 2026-10-28
agent: claude
tags: [engineering, devops]
outcome: research
summary: "Profiling round 2: CI and conventions machinery improved sharply, agent behaviour barely moved; five items taken into the current tranche and ten deferred as backlog."
---

# Profiling round 2 — what moved, what did not, and what is deferred

Round 1 (2026-10-07) produced the instruction trim (MO-26-10-07-21.31.01), `morpheus wait-ci`
(MO-26-10-07-21.31.17) and the profiler follow-ups (MO-26-10-07-21.31.18). Round 2 measures what
changed after them. This entry is the durable record of that analysis; the work it led to is in
the roadmap items listed at the end.

**Windows.** Before: 2026-09-24→10-07. After: 10-09→10-22. Latest week: 10-22→10-28, reported
where it differs. Session metrics come from local Claude Code and Codex transcripts; PR and CI
metrics from GitHub history for Evo and Morpheus.

## The machinery improved

| Metric | Before | After |
|---|---|---|
| Conventions failures per PR, Evo | 88% | 24% |
| Conventions failures per PR, Morpheus | 65% | 14% |
| Evo CI wall-minutes per PR | 120 | 41 |
| Evo CI failure rate | 15% | 5% |
| Evo p90 open→merge | 53h | 18h |
| `SKInternalErrorDomain` and the named UI flakes | present | gone |

## Agent behaviour barely moved

| Metric | Before | After / latest week |
|---|---|---|
| Claude `context refresh` per session | 2.3 | 3.1–3.2 |
| CI polling calls per session | 4.0 | 4.6–7.8 |
| `wait-ci` per session, Claude | ~0 | ~0 |
| `wait-ci` per session, Codex | ~0 | 5.4 in the latest week |

Agents are also faking context receipts: `cat … >/dev/null && morpheus context refresh` reads the
records into nowhere and then asserts they were read — the one failure the context protocol says it
cannot detect (`architecture.md` §7.10).

The pattern across both tables: rules a tool enforces (conventions, the review label, CI scope)
improved; rules left to agent discipline (refresh once, never poll, read before refreshing) did not.
That is the case for the tranche's enforce-in-code items rather than another round of prose.

## Context keeps growing

- Claude first-turn context: 91k → 101k → 107k tokens across the three windows.
- The claude.ai connector deferred-tool list went from about 6k to about 14k tokens after new or
  re-enabled connectors (OpenSEO, Google Calendar, Sentry, Cloudflare, Granola, Webflow, Asana).
  Nothing in any repository changed when it grew.
- Evo `AGENTS.md` is 34.7KB; Morpheus's is held to 20KB by a test.
- Morpheus `.agent/decisions.md` is 139KB, about 35k tokens to read in full, and every session is
  told to read it — the likeliest incentive for the faked receipts above.
- Subagents start at about 74k tokens.

## Remaining failure classes

- Superseded CI runs that fail silently: about 31% of Evo conventions failures after 10-08.
- The review-label race on PRs opened ready: 6 of 13 sampled Evo cases came from robbie-del's
  Cursor and Claude branches, which do not load Morpheus's instructions.
- About 19 trunk-rescue PRs opened; none adopted.
- PRs labelled `manager:needs-human`: 4 → 16.
- Evo iOS shared DerivedData `build.db` corruption: 14 of 25 iOS failures 10-13→10-17, none since
  10-18 — although the self-heal (MO-26-10-13-17.05.11) shipped on 10-13. Why the failures continued
  for four days and then stopped is not established.
- Review-coverage failures (commits after the review's `covered` commit) in Evo: 6 → 14 sampled.

## Taken into the current tranche

Filed and claimed by separate sessions:

- MO-26-10-28-14.08.05 — Enforce the context protocol in code
- MO-26-10-28-14.09.01 — Extend wait-ci to any workflow run and steer agents off polling
- MO-26-10-28-14.08.43 — Let superseded CI runs pass with a notice instead of failing silently
- MO-26-10-28-14.08.53 — Make trunk-rescue PRs useful or retire them
- MO-26-10-28-14.11.57 — Close profiling measurement gaps: archived Codex sessions and review
  waivers

## Deferred, filed as backlog

Chris asked for every follow-up not in the tranche to be stored as roadmap work.

| Item | Priority | Needs Chris |
|---|---|---|
| MO-26-10-28-14.10.50 — Per-project connector profiles and a connector audit | P2 | which connectors belong where |
| MO-26-10-28-14.10.57 — Split `decisions.md`/`learned.md` into a generated index plus one file per entry, under a byte budget | P1 | no (may want to see the core list) |
| MO-26-10-28-14.10.58 — Close the rest of the review-label race | P2 | who asks robbie-del about his setup |
| MO-26-10-28-14.10.59 — Weekly needs-human digest by `zoe-text` | P2 | yes, cadence and shape |
| MO-26-10-28-14.11.00 — Triage failed main-branch and scheduled runs no owner watches | P2 | only for the model-backed stage |
| MO-26-10-28-14.11.01 — Slim instruction profile for subagents and reviewers | P2 | no |
| MO-26-10-28-14.11.05 — Model × effort replay benchmark | P2 | quota ceiling and models |
| MO-26-10-28-14.11.06 — Warn before a push invalidates the review; name missing evidence | P2 | consent model for a `pre-push` block |
| MO-26-10-28-14.11.07 — Verify the `build.db` self-heal prevents recurrence | P3 | no |
| MO-26-10-28-14.11.08 — Re-run this profiling two weeks after the tranche merges | P2 | no |

## Notes and dead ends

- **A hand split does not fix a growing record.** Lakina split its records by hand on 2026-09-22
  (cpheinrich/lakinacapital#383); its hand-written index grew 51% in 15 days. The split item
  therefore generates the index from per-entry frontmatter and budgets it in CI.
- **Most of the proposed "PR shepherd" already has an owner.** Open PRs belong to the GitHub
  Manager, Evo TestFlight delivery to CD V2, handed-over incidents to the devops-engineer skill.
  Only failed runs on `main` and scheduled workflows outside CD V2 were unowned, and only that
  remainder was filed (MO-26-10-28-14.11.00).
- **Existing items checked before filing**, so nothing duplicates: MO-26-08-01-047 (`inbox status`)
  is related to the digest and is referenced from it; MO-26-10-01-12.55.11 (manager issue triage)
  is distinct from CI-failure triage; MO-26-10-13-17.05.11 shipped and is referenced by the
  verification item rather than reopened.
- **Delivery shape.** This PR changes only `hq/product/` and `.agent/`, on an `inbox-` branch that
  stakes no id. `check pr` then requires no claimed item and no independent review
  (`hasNoSubstantiveChange`), and its `records-only:` waiver applies only to claimed branches.
