---
id: MO-26-08-01-047
title: "inbox status: one front door across every repo"
status: backlog
priority: P2
goal: MO-G-2026-Q3-01
owner: agent
prs: []
created: 2026-08-01
updated: 2026-08-01
---

> Migrated from `MO-047` to `MO-26-08-01-047` (MO-057). References to `MO-047` in git
> history, commit messages and merged pull requests still resolve — the old number is
> the last field of the new id.

## Context

There are now six inboxes — Morpheus, Darwin, Evo, cpheinrich.com, heinrichbros.com and Lakina.
Coming back after two days means opening six files to find four open questions, and some are stale
by the time they are read: Evo's asked for two PRs to be merged that had already merged.

One inbox per person *per repo* was right when there was one repo, and is still right — the repo is
what makes an inbox reviewable, diffable, and CI-checkable, and a single global inbox gives that
up. The problem is not where the files live; it is that there is no front door.

Approved 2026-07-31: *"this sounds like a nice utility so lets build it, its just not the end of
the story."* Build the small version; do not treat it as the answer to multi-repo workflow.

## Approach

`morpheus inbox status` walks `~/.morpheus/registry.json`, reads each project's
`hq/inbox/<handle>.md`, and prints every open `❗` item with its repo, number, title, and the agent
that raised it. The terminal becomes the front door; the files stay where they are.

Details worth getting right:

- **Open means `❗`**, which the parser already distinguishes from `✅` — `inbox validate` enforces
  that every item is exactly one of the two, so the signal is reliable.
- **Report staleness, do not hide it.** An item is stale when the inbox `date` is older than the
  repo's most recent commit touching `hq/`. Evo is the motivating case. Print the age rather than
  suppressing the row.
- **A missing or unreadable inbox is `null`, not zero.** Same rule as `init status` detection: "no
  open items" and "could not look" are different answers, and collapsing them is how a status
  display starts lying.
- **Registry paths go stale.** Two entries pointed at a deleted scratchpad for days. Skip
  unreadable paths with a named warning rather than failing the whole command.
- Filter by handle, since the inbox filename is a GitHub handle and one machine may hold projects
  belonging to more than one person.

Read-only. It writes nothing, so it is safe to run any time and safe in CI.

## Open question, deliberately not decided here

This is a *reader*. It does not let you reply from one place, and replying is the other half of the
annoyance. Whether a write path is wanted — and whether that is `inbox reply`, an aggregator repo,
or something else — should be decided after living with the reader for a while.

## Test plan

- A fixture registry of three projects: one with two open items, one with none, one whose path does
  not exist. Assert the third reports as unreadable and does not read as zero.
- An inbox with both `❗` and `✅` items returns only the `❗` ones.
- Staleness: a fixture whose inbox date predates a later `hq/` commit reports an age.
- Run against the real six repos and compare against opening all six by hand.
