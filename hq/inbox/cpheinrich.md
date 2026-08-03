---
owner: cpheinrich
date: 2026-08-02
agents:
  - claude
previous: .agent/inbox-archive/2026-08-02-1730-cpheinrich.md
---
# Inbox — 2026-08-02 (evening)

**The issue-triage agent you asked for is paused one step in, on two questions I could not answer
for you.** Both are about blast radius rather than design, and item 1 has them. I read all seven
issues first, so the triage half is ready to run the moment the build question is settled.

**Six issues left, not seven.** [#78](https://github.com/cpheinrich/morpheus/issues/78) was already
fixed by [#79](https://github.com/cpheinrich/morpheus/pull/79) — a parallel session shipped the fix
without closing the issue. I reproduced the original report against current `main`, confirmed it
passes, and closed it. Worth knowing the drift exists: a fix that lands without closing its issue
looks exactly like an open bug.

**Nine beats have run since we last spoke** and they are picking sensibly. Which surfaced something
you asked about and I had no good answer to: **there is nowhere durable to read them.** Item 2.

**One correction to the architecture, found answering your design-system question.**
`architecture.md` names **Style Dictionary** in three places. It is not a dependency and never has
been — the token pipeline is DTCG-shaped JSON read by Morpheus's own `tokens build`. An architecture
doc naming a package that was never installed sends someone hunting for a config file that does not
exist. I will fold the fix into the triage work unless you would rather it stayed as-is.

> `❗` needs you and ends in an empty `~`. `✅` is settled. Reply after the empty `~`.

## ❗ 1. The issue-fixing agent has a blast radius I should not pick for you · `claude`

The triage half is straightforward and I will build it either way: on a new issue, an agent reads
it, labels it, and comments with an assessment. Cheap, reversible, no write access to code.

The *fixing* half is different, and two things about it are genuinely your call.

**a) This repo is public, so anyone can open an issue.** An agent that reads issue text and then
writes code makes the issue body untrusted input to a model with commit access — the same class as
the `${{ github.head_ref }}` injection the reviewer caught this afternoon, except the payload is
prose rather than shell. It is also a spend surface: fifty issues is fifty runs at roughly $1.50.

**b) "If the submitter doesn't produce a PR themselves" cannot be known at issue-open time.** It
needs either a wait or a signal.

- **A — trusted authors, and a delayed sweep (recommended).** Triage every issue on open, from
  anyone. *Fix* only issues from `OWNER`/`MEMBER`/`COLLABORATOR`, and only after the hourly
  heartbeat sees them sitting unclaimed with no linked PR for some hours. The heartbeat already
  exists, already runs hourly, and already has a concurrency ceiling — this is the work it was
  built to dispatch, so it needs no second scheduler.
- **B — trusted authors, fix immediately on open.** Simpler, faster, no waiting. Gives up the
  "let them fix it themselves" behaviour you asked for, and means a typo'd issue becomes a PR
  before you have finished writing the issue.
- **C — label-gated.** Nothing happens until you add `agent-fix`. Safest and fully deliberate;
  it is also one more thing to remember, and the whole point was that it happens without you.
- **Other —** including "triage only, never fix", which is a legitimate answer given (a).

I lean A because it reuses the heartbeat rather than adding a second autonomous path, and because
the ceiling is already the guard against a runaway queue.

~

## ❗ 2. Nine beats, and nowhere to read them · `claude`

You asked where heartbeat records are stored. The honest answer is **only the Actions job summary** —
the beat writes nothing to the repo, deliberately, because a scheduled job would have to push to
protected `main`.

That was fine at twice a day. At hourly it is not: 24 beats a day into a tab, no way to grep what
the heartbeat thought last Tuesday, and GitHub ages logs out at 90 days. A record you cannot search
is close to no record.

Also worth knowing, from the nine so far: **they are not actually hourly.** 12:08, 14:39, 16:06,
18:03, 20:13 — GitHub's cron is best-effort and the top of the hour is its most congested slot. Not
a fault, but "hourly" is aspirational rather than literal.

- **A — append to a file on a records branch (recommended).** The beat opens or updates a single
  `inbox-YYYY-MM-DD`-style branch with a one-line-per-beat log, and it merges itself since it stakes
  no id. Greppable, in git, costs nothing, and reuses the records exception that already exists.
- **B — leave it in job summaries.** Zero work. Accept that the record is unsearchable and
  90-day-lived, on the grounds that a beat older than a day is rarely interesting.
- **C — only record beats that changed their mind.** Log a line when the pick differs from the
  previous beat, so the file is a history of decisions rather than of runs. Smaller and more
  readable; loses the ability to prove the heartbeat was alive at a given hour.
- **Other —** including a `/hq` view, which is the version that eventually wants building anyway.

~

## ✅ 3. The re-review gate shipped, and its own review caught a security bug · `claude`

[#75](https://github.com/cpheinrich/morpheus/pull/75). Re-reviews now diff against the last
*reviewed* commit rather than the merge base, and a push touching a file the last review named is
never skipped — your signal, working:

```
Comparing against the last reviewed commit: e092b04f6a93…
Reviewing: touches a file the last review named — checking whether it was addressed
```

**The reviewer caught three things I would have shipped.** The worst was a script injection:
`${{ github.head_ref }}` interpolated into a `run:` block, which substitutes *before* bash parses.
Branch names are attacker-controlled on fork pull requests and this repo takes external
contributions. It filed that under "Minor"; it was the most serious thing in the review.

It also caught that the caller workflow was hardcoded as `ci.yml` in a *reusable* workflow — a
permanent silent no-op in any consumer named otherwise — and that my `pathsMentioned` narrowed in
the exact place its docstring promised to widen, with a URL test that passed for the wrong reason.

Three remaining findings are filed as [#76](https://github.com/cpheinrich/morpheus/issues/76).

## ✅ 4. Reporting back on the rung after a week, by default · `claude`

You did not answer last cycle's offer, so I am taking option A rather than re-asking: one short item
next weekend with what the reviews caught, what they cost, and whether the beats were useful. Say so
if you would rather not.

## ✅ 5. Where things stand · `claude`

| | |
| --- | --- |
| Board | valid, 552 tests, no open claims |
| Open issues | 6 — #70, #76, #80, #81, #82, #83 |
| Merged since last cycle | [#75](https://github.com/cpheinrich/morpheus/pull/75), [#79](https://github.com/cpheinrich/morpheus/pull/79) |
| Heartbeat | 9 beats, picking `MO-26-07-28-005` consistently |
| Agent review | live on Opus 5, gated on substantive changes |

Of the six open issues, four are real bugs with clear fixes (#80, #82, #83 and, less clearly, #81),
and two are follow-ups I filed against my own work (#70, #76). I will not start fixing them until
item 1 is settled, since how the agent handles issues changes whether I fix these by hand or use it
as its first real exercise.

## Parked

**Dispatch.** Unchanged and not yet due — the decision was to wait for a week of beats, and there
have been nine. Next weekend.

**28 stale local branches still block future claims.** Unchanged, still not filed.

**heinrichbros.com does not boot locally.** Unchanged, still yours to call.

**Evo's brand design session**, **Lakina's Vercel seat**, and **Google billing** — all unchanged.
