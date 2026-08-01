---
owner: cpheinrich
date: 2026-08-01
agents:
  - claude
previous: .agent/inbox-archive/2026-08-01-1300-cpheinrich.md
---
# Inbox — 2026-08-01 (evening)

**The heartbeat and verifier work is done — five items specced, built, tested and merged.** PRs
[#50](https://github.com/cpheinrich/morpheus/pull/50), [#51](https://github.com/cpheinrich/morpheus/pull/51),
[#53](https://github.com/cpheinrich/morpheus/pull/53), [#54](https://github.com/cpheinrich/morpheus/pull/54),
[#55](https://github.com/cpheinrich/morpheus/pull/55). Tests went 303 → 412. Morpheus now has a
scheduled heartbeat, a third exit for agents that hit ambiguity, and a named four-rung verifier
stack.

**The most useful thing I found was not new.** I went looking for "net-new edges worth making
explicit" expecting to invent some, and instead every edge worth drawing was **already declared in
the schema and traversed by nothing**. `JournalEntry.outcome` has had `blocked` in its enum since
MO-001. `RoadmapItem.acceptance` had never been set by a single item, in fifty-one of them. Twice
out of three, the concept was anticipated and only the path was missing. That became a written rule:
draw an edge when the schema declares it and nothing traverses it.

**The heartbeat runs today, with no API key, because assess is a ranking function rather than a
prompt.** That was the one significant departure from the handoff spec, and it is the reason there
is something working rather than something waiting on you.

**Your browser rule is in** — `AGENTS.md` and `decisions.md`, with the boundary written explicitly:
it applies when browser use is the *single, entire* obstacle, and does not touch cases where you are
wanted for judgment. I used it twice today, once to read a CI failure the GitHub API would not give
me, and once on your heinrichbros question below.

> `❗` needs you and ends in an empty `~`. `✅` is settled. Reply after the empty `~`.

## ❗ 1. heinrichbros.com — you did fix that, and it broke somewhere new · `claude`

~ *(previous: "What I thought this was fixed. Is it still broken?")*

**You are half right, and the half you remember is genuinely fixed.** The duplicate `nodejs_compat`
is gone — `vite.config.ts:16` now carries only a `compatibility_date`, so the miniflare error I
reported is no longer reachable.

It still does not boot, but for a **third reason neither of us has seen**, and it now fails earlier
than either of the previous two:

```
ERR_PNPM_IGNORED_BUILDS: esbuild@0.27.3, sharp@0.34.5, unrs-resolver@1.12.2, workerd@1.20260515.1
Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.
```

pnpm 11 refuses to run those packages' postinstall scripts until they are approved, and `pnpm dev`
runs an install first — so it dies before wrangler is ever invoked. **This means the old
compatibility-date problem is now untested rather than fixed**: I could not get far enough to see
whether `2026-07-25` in `wrangler.jsonc` still exceeds what workerd `1.20260515.1` supports.
Installed wrangler is still `4.92.0`; latest is `4.118.0`.

Two other things worth knowing, found while in there:

- **The repo has no committed lockfile at all** — none in `web/`, none at root. That is why the
  approval prompt appears fresh on every machine, and it is the more interesting of the two.
- The app moved to `web/` in PR #1, so the paths in my previous report are stale.

I left the repo exactly as found, removing the `pnpm-lock.yaml` and `pnpm-workspace.yaml` my install
generated. **I did not fix it** — it is a second repo on an open branch, and you asked a question
rather than for a change.

The fix looks like three things: commit an `onlyBuiltDependencies` list, commit a lockfile, bump
wrangler. **Want that as its own PR over there?**

~

## ✅ 2. The three questions your spec delegated, and how I answered them · `claude`

**Verifiers are a concept, not a directory.** The four rungs already live in four places —
`.github/workflows/` for 1 and 2, `qa/acceptance/` for 3, a pull request for 4 — so a `verifiers/`
directory would have held nothing but pointers. `qa/` keeps holding artifacts. What was missing was
*vocabulary*, and the evidence is direct: with no word for "the thing that checks the doer", nobody
had noticed for two months that rung 3 had no input.

**Which edges to draw.** Three qualified under the dangling-field test; two did not
(`Request.roadmap` and `Goal.current` — one use each, so *extract on the second use* applies).

**Two net-new verifier ideas**, both from applying your spec's own definition to what Morpheus
already did:

1. `check pr` accepted `skip-tests:` and `records-only:` from the author of the PR it was checking,
   **silently**. By that definition it is not verification. Both stay allowed; they are now visible.
   → MO-052
2. A blocked outcome must name its unblocker, or it is a crash with better manners. → MO-049

## ✅ 3. What each item actually does · `claude`

| Item | What landed |
| --- | --- |
| [MO-048](../product/roadmap/MO-26-08-01-048-work-graph-edges-blocked.md) | The specification: work graph, blocked, verifier stack, your browser rule |
| [MO-049](../product/roadmap/MO-26-08-01-049-blocked-first-class-outcome.md) | `pm block` / `pm unblock` — three records, `needs` required by the schema |
| [MO-050](../product/roadmap/MO-26-08-01-050-heartbeat-scheduled-dispatcher.md) | `morpheus heartbeat` plus a scheduled workflow, twice on weekdays |
| [MO-051](../product/roadmap/MO-26-08-01-051-agent-code-review-independent.md) | Agent review rung, persona as a versioned file, `acceptance` finally traversed |
| [MO-052](../product/roadmap/MO-26-08-01-052-waivers-surfaced-not-swallowed.md) | Waivers report as `~ waived`, carrying their stated reason |

Try it:

```sh
morpheus heartbeat
morpheus pm block MO-005 --needs "which dashboard sections matter first"
```

Run against the real board, the heartbeat picked MO-005 — P1, serves the live goal, oldest of the
P1s. That is what I would have picked by hand.

## ✅ 4. Three bugs found on the way, all the same shape · `claude`

Each was invisible because **nothing read the value**:

- **`src/inbox/parse.ts` matched roadmap ids as `RM-\d{3,}`** — a prefix retired in MO-002. No
  current id could match, so every roadmap link in every inbox heading had been silently dropped for
  as long as the current ids have existed.
- **A bare `skip-tests:` captured the next line of the PR body as its reason.** `\s` includes
  newlines, so the regex crossed the blank line and read `## Test plan` as a perfectly good
  justification — a non-reason passing as a real one, inside the fix for exactly that.
- **`RoadmapItem.acceptance` had never been set**, so nothing ever complained that rung 3 had no
  input.

One lesson, three times in a day: *a field nobody reads cannot be observed to be broken.*

## ❗ 5. Two things need your key, and nothing else · `claude`

Both are built and tested, and inert until a credential exists. I did not guess which.

**Agent review (rung 2)** runs on every PR right now and reports itself as **skipped** — a job
summary plus a warning annotation reading "rung 2 is unconfigured — no reviewer ran". It
deliberately does not go quietly green. Add `ANTHROPIC_API_KEY` to the repo or org secrets and it
starts working; nothing else changes.

**Heartbeat dispatch** is wired behind `heartbeat.dispatch` in `morpheus.json`, currently `false`.
Turning it on without a key refuses loudly rather than silently falling back to proposing.

The open question is the one your spec flagged: **which model, and whose subscription pays for it.**
Your Anthropic API account, or a Claude subscription token? It changes nothing in the code — the
workflow takes the key as a secret and is otherwise agnostic — but I am not picking which of your
accounts gets billed.

~

## ❗ 6. The heartbeat's schedule has already started · `claude`

`schedule.yml` runs at 09:00 and 17:00 on weekdays, matching the inbox rhythm. GitHub ignores
`schedule:` on branches, so **it began when MO-050 merged** — beats will appear in the Actions tab
without you doing anything.

It writes nothing to the repo and starts no work. Each beat is a job summary naming the next item
and why. If twice a day is noise, it is a one-line change.

Worth knowing: **GitHub disables a scheduled workflow automatically after 60 days without repo
activity.** Not a concern now, but it is the failure mode where a heartbeat quietly stops and nobody
notices — worse than not having one.

Leave it at twice daily?

~

## ✅ 7. Where the repos stand · `claude`

| Repo | State | Waiting on |
| --- | --- | --- |
| **Morpheus** `MO` | 55 items, board valid, 412 tests, no open claims | your key, for two inert features |
| **heinrichbros.com** `HB` | does not boot locally — new reason, item 1 | your call on a fix PR |
| **Darwin** `DW` · **Evo** `EV` · **cpheinrich.com** `CPH` · **Lakina** `LK` | untouched this session | their own inboxes |

A parallel session merged MO-053 and MO-054 while I worked. No collision — `pm new` allocated around
it correctly, which is MO-040's id-allocation fix doing its job unprompted.

## Parked

**28 stale local branches still block future claims.** Unchanged, and it bit again: `pm claim`
passes git's raw error through for a local branch where it refuses gracefully for a remote one.
Still not filed, since you have not asked for it.

**Committing your inbox replies would red CI.** It happened again — your reply to item 3 consumed
the `~` slot, so `inbox validate` failed on `main` all session. `pm block` is built to append to an
invalid inbox precisely because that is the normal mid-cycle state.

**Evo's brand design session**, **Lakina's Vercel seat**, and **Google billing** — all unchanged,
all yours.
