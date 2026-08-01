---
owner: cpheinrich
date: 2026-08-01
agents:
  - claude
previous: .agent/inbox-archive/2026-07-31-2200-cpheinrich.md
---

# Inbox — 2026-08-01

**All four of your replies are acted on, and one of them dissolved a blocker rather than solving
it.** You could not find a personal Vercel account because there is no personal Vercel account —
neither `cpheinrich.com` nor `heinrichbros.com` is on Vercel at all. Both serve from Cloudflare.
That premise had been carried through three cycles unchallenged; item 1 has the evidence and it is
closed.

**Morpheus itself moved a lot.** MO-010 finally landed — `architecture.md` restructured, 2048 →
1458 lines — and the board reconciled MO-045 and MO-046, which had been shipped since the 30th but
still read `review`. MO-047 is filed for the inbox reader you approved. **MO-004 is agreed as
next** and is the one thing waiting on nothing but a session.

**Two of your three sites run locally; the third does not boot.** heinrichbros.com fails before it
serves a byte, for two stacked reasons, both in item 3. That is the reason not to merge its PR yet.

Also: the home folder reorganisation is done — everything is under `~/code` and `~/cowork` now, and
a handoff sits in `local/handoffs/2026-07-31-home-refactor-and-mo-010.md`.

> `❗` needs you and ends in an empty `~`. `✅` is settled. Reply after the empty `~`.

## ✅ 1. There is no personal Vercel account — the sites are on Cloudflare · `claude`

~ *(previous: "I can't find my personal Vercel account… are we sure cpheinrich and heinrichbros are on Vercel?")*

**They are not, and you are not missing anything.** Evidence:

| Repo | `.vercel/project.json` | Serves from |
| --- | --- | --- |
| cpheinrich.com | none | Cloudflare (`server: cloudflare`) |
| heinrichbros.com | none | Cloudflare Worker — `wrangler.jsonc` with custom-domain routes and a `FAMILY_AUTH` KV binding |
| lakina | none | — |
| darwin | `team_WvHuh3zpY4O68wXCIUolqksG` | Vercel |
| evo | `team_WvHuh3zpY4O68wXCIUolqksG` | Vercel |

Only Darwin and Evo are on Vercel, both under the same team. The earlier item assumed the two
personal sites needed a personal Vercel account to *deploy to*; they were already deployed
elsewhere. Nothing to create, nothing to paste.

**This retires the blocker but not MO-011.** "Post the staging URL into the PR description" was
parked behind the Vercel token — for Darwin and Evo that still holds. For the Cloudflare repos the
preview story is different, and MO-011 should say which repos it covers before it is claimed.

One thing this exposes, raised as item 5.

## ✅ 2. MO-004 is next · `claude`

~ *(previous: "Yes the custom claims make sense. Go for it.")*

Recorded in `.agent/decisions.md`. Not claimed, because a claim marks an item in-progress and
stakes a branch, and I did not want to hold it open across a session boundary — the next session
claims it and starts clean.

Worth knowing before it starts: Darwin's implementation is the reference, and the generalisation is
mostly about what stays project-specific. The claim gates both the route and the Firestore rule
from one fact, which is the property worth preserving.

## ❗ 3. Two sites run; heinrichbros.com does not boot · `claude`

~ *(previous: "I want to verify everything looks ok… can you launch three browser windows with each one of these sites running locally?")*

Two are up and open in the browser pane:

| Site | Port | State |
| --- | --- | --- |
| **cpheinrich.com** | 3101 | Renders. No console errors. One empty image block on the hero right — worth a look, it may be intentional |
| **lakina** | 3103 | Renders — the minimal "Carve your own path." splash |
| **heinrichbros.com** | 3102 | **Fails to start** |

heinrichbros.com fails for two stacked reasons, and the first hides the second:

1. **`nodejs_compat` is declared twice** — `wrangler.jsonc:6` and `vite.config.ts:16`. vinext merges
   both in dev, and miniflare refuses to start on a duplicated compatibility flag. I confirmed the
   fix by deleting the `vite.config.ts` copy, which is the right one to lose since `wrangler.jsonc`
   is the deploy source of truth. **I reverted it** — see below.
2. **The bundled runtime is too old.** With the flag fixed it gets one step further and stops on
   `requires compatibility date "2026-07-25", but the newest supported is "2026-05-22"`. Installed
   wrangler is `4.92.0` / workerd `1.20260515.1`; latest wrangler is `4.118.0`.

So the real fix is one line plus a dependency bump. **I reverted my change and left the repo
exactly as found**, because a partial fix that still does not boot is worse than a clear report,
and I was not going to bump dependencies unattended on a branch with an open PR.

Note the live site is fine — production reads only `wrangler.jsonc`, so only dev is broken. That is
also why nobody noticed.

**Do you want me to do the fix as its own PR in that repo** — remove the duplicate flag, bump
wrangler, verify it boots — before you merge #1? I would not merge the retrofit PR until this is
sorted, since "I verified it looks ok" is exactly what you cannot do right now.

~

## ✅ 4. MO-047 filed for the inbox reader · `claude`

~ *(previous: "this sounds like a nice utility so lets build it, its just not the end of the story.")*

[MO-047](../product/roadmap/MO-047.md), P2. `morpheus inbox status` walks the registry and prints
every open `❗` across all repos, so the terminal is the front door and the files stay where they
are.

Your "not the end of the story" is written into the item as an explicit non-goal: it is a *reader*,
replying from one place is unsolved, and that should be decided after living with the reader rather
than designed now. Three details are specified because they are where this kind of tool goes wrong:
an unreadable inbox reports as `null` rather than zero, staleness is printed rather than hidden
(Evo's stale inbox is the motivating case), and dead registry paths warn instead of failing the
run.

## ❗ 5. Three manifests record no deviations and no domain · `claude`

Found while answering item 1, and it is the reason that item survived three cycles.

`architecture.md` §4 says the canonical stack lives in the spec and only *deviations* are recorded
per project. But heinrichbros.com runs on Cloudflare Workers rather than the canonical Vercel and
its `morpheus.json` has no `deviations` key at all. Neither does cpheinrich.com or Lakina. None of
the three sets `domain` either.

A deviation nobody recorded is indistinguishable from the canonical choice. That is precisely how
"both sites are personal, so both go on Hobby" got written down as fact and carried forward three
times without anyone checking.

Two things could follow, and I would like your call on which:

- **Just backfill the three manifests** — small, and it fixes today's wrongness.
- **Make `doctor` check it** — if a repo has a `wrangler.jsonc` or a `.vercel/` link that disagrees
  with the canonical stack and no matching `deviations` entry, say so. This is the version that
  stops it recurring, and it is a real item rather than a five-minute edit.

~

## ✅ 6. Where every repo stands · `claude`

| Repo | State | Open PR | Waiting on |
| --- | --- | --- | --- |
| **Morpheus** `MO` | 47 items, board valid, 279 tests, no claims | — | MO-004 to be claimed |
| **Darwin** `DW` | DW-005 added; `/hq` auth live | — | its own inbox |
| **Evo** `EV` | EV-005 open and green; EV-006/7/8 exist only on that branch | [#12](https://github.com/darwin-health/evo/pull/12) | your call to merge |
| **cpheinrich.com** `CPH` | runs locally, renders | [#1](https://github.com/cpheinrich/cpheinrich.com/pull/1) | your verification |
| **heinrichbros.com** `HB` | **does not boot locally** | [#1](https://github.com/heinrichbros/heinrichbros.com/pull/1) | item 3 |
| **Lakina** `LK` | runs locally, renders | [#3](https://github.com/lakinacapital/lakina/pull/3) | your verification |

**EV-006, EV-007 and EV-008 are unreachable until #12 merges** — all three were created on the
EV-005 branch, so they do not exist on `main`. EV-007 is separately blocked on you: it says the
typeface is the design session's call.

## Parked

**28 stale local branches in this repo will block future claims.** `pm claim MO-010` died on
`fatal: a branch named 'mo-010-…' already exists` — a leftover from PR #31. `pm claim` refuses
gracefully when *origin* has the branch but passes git's raw error through for a local one. Worth
an item; not filed, because you did not ask for one.

**MO-010's length target was missed deliberately** — 29% rather than the ~50% the item asked for.
The open question is in [PR #46](https://github.com/cpheinrich/morpheus/pull/46) and unanswered: if
the diagrams and lookup tables are fair game, a second pass gets much closer. I did not assume they
were.

**Evo's EV-004 reads `review` but shipped as PR #10.** Same drift MO-045/046 had. Left alone
deliberately — it self-heals on Evo's next `pm claim`, and the file sits inside your open #12.

**Committing your inbox replies would red CI.** Unchanged, and it did not bite this cycle either
since you edited on `main`.

**Evo's brand design session.** Still the thing gating Evo's brand work, still wants you in the
room. Evo's inbox, Evo's call.

**Lakina's Vercel team.** Unchanged — one paid seat, waiting on you.

**Google billing.** Unchanged.
