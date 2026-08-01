---
id: MO-26-08-01-049
title: "Blocked is a first-class outcome, routed to the inbox"
status: shipped
priority: P0
goal: MO-G-2026-Q3-01
owner: agent
prs: [51]
created: 2026-08-01
updated: 2026-08-01
---

> Migrated from `MO-049` to `MO-26-08-01-049` (MO-057). References to `MO-049` in git
> history, commit messages and merged pull requests still resolve — the old number is
> the last field of the new id.

## Context

An agent has two exits today: it finishes, or it fails. Real work has a third — *started, hit
ambiguity, stopped, and here is exactly what I need* — and with nowhere to put it, an agent does
the worst available thing: it guesses and ships something plausible.

**Escalating is cheap; shipping half-baked is expensive.** That asymmetry has to be structural,
not advisory, or it gets bulldozed the moment a run is going well.

`JournalEntry.outcome` has had `blocked` in its enum since the schema was written. Nothing reads
it, nothing writes it, and no path leads out of it. The concept was anticipated; the edge was
never drawn. That is what this item builds.

## Approach

**1. `blocked` becomes a roadmap status.** `RoadmapStatus` gains it, between `in-progress` and
`review`. A blocked item then appears on the generated index next to everything else, which is the
point — a blocked item that exists only in a worklog is invisible to the board and to MO-050.

**2. A blocked item must name its unblocker.** `RoadmapItem` gains an optional `needs: string`,
with a schema refinement: `status: blocked` **requires** a non-empty `needs`. "I am blocked"
without "here is what I need" is a crash with better manners. This is one of the two net-new
verifier ideas from MO-048, and it is enforced by `pm validate`, which already runs in CI — so it
costs no new mechanism.

**3. `morpheus pm block <ID> --needs "<what would unblock this>"`.** Four writes, one commit:

- item frontmatter → `status: blocked`, `needs: …`, `updated: today`
- a worklog entry at `.agent/worklog/YYYY-MM-DD-<id>-blocked.md` with `outcome: blocked`
- an open `❗` item appended to `hq/inbox/<handle>.md`, carrying the id and the `needs` text
- push, so the blocked state is visible to every other session rather than sitting local

**4. The claim is held, not released.** A blocked item keeps its branch: the partial work lives
there, and re-taking it means checking that branch out rather than starting over. `pm claims`
labels it so it does not read as active work.

This is the load-bearing distinction for MO-050: **blocked is not in-flight.** A blocked claim
must not count toward the heartbeat's concurrency ceiling, or one unanswered question permanently
consumes a lane.

**5. `morpheus pm unblock <ID>`** clears `needs` and returns the item to `in-progress`. Without it
the only exit is hand-editing frontmatter, which is how a status stops being trusted.

### A bug this uncovers

`src/inbox/parse.ts` matches a roadmap id in an item heading with `/(RM-\d{3,})/` — the pre-MO-002
prefix, from before ids were namespaced per project. No current id can match it, so every roadmap
link in every inbox heading has been silently dropped. `pm block` writes exactly such a heading,
so this is a fix the item needs rather than one it merely notices.

## Non-goals

Blocked notifies nowhere but the inbox. No email, no push, no Slack. The inbox is already the
agreed exchange surface, and a second one splits the record.

## Test plan

- `RoadmapItem` accepts `status: blocked` with `needs` and rejects it without — the refinement
  *is* the verifier, so it gets a test in both directions.
- `pm block` on a fixture repo: frontmatter updated, worklog entry written with `outcome: blocked`,
  inbox gains one open item with a `~` slot, and `inbox validate` passes on the result.
- `pm block` against an inbox that does not exist yet creates a valid one, summary first.
- `pm unblock` round-trips: block then unblock leaves `status: in-progress` and no `needs`.
- The inbox heading parser recovers `MO-050` from a heading, and still recovers a legacy `RM-004`.
- A blocked item is excluded from the in-flight count MO-050 consumes.

## Open questions

None.
