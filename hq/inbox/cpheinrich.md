---
owner: cpheinrich
date: 2026-07-29
agents:
  - claude
previous: .agent/inbox-archive/2026-07-29-2047-cpheinrich.md
---

# Inbox — 2026-07-29 (night)

**Both decisions you made are shipped.** "Primitives only" is settled in three places with tests
pinning it ([#41](https://github.com/cpheinrich/morpheus/pull/41), MO-045), and reconcile now
refuses to mark an item shipped when the merged PR did none of its work
([#42](https://github.com/cpheinrich/morpheus/pull/42), MO-046). **279 tests**, board clean, no
claims outstanding.

**The kit is unblocked.** MO-004, MO-005 and MO-006 were waiting on the kit having content whose
shape was agreed, and now it is.

The Vercel work is the one thing I could not finish: it needs you signed in as your personal
account, and the browser here is signed in as Darwin. Two minutes of your time, then I can do the
rest.

> `❗` needs you and ends in an empty `~`. `✅` is settled. Reply after the empty `~`.

## ❗ 1. Vercel needs your personal login before I can go further · `claude`

You said to go ahead with your personal account, and both sites are personal — so both go on
Hobby, no Pro needed, and Lakina waits as you said.

**What stopped me.** Both the Vercel CLI and the browser are authenticated as
`darwinhealthinc-4781`, and the only team visible is `darwin-health`. Vercel is one session per
browser profile, so there is no switcher to click. Neither repo has a Vercel project yet — no
`.vercel/` locally, and no bot comment on either PR.

**What I need from you**, whichever you prefer:

- **Sign in to your personal account** in the Chrome window I have open, tell me, and I will
  create a token and set both projects up. Caveat: this signs Darwin out of that browser profile.
- **Or paste a personal access token** — [vercel.com/account/settings/tokens](https://vercel.com/account/settings/tokens?authuser=cpheinrich@gmail.com)
  while signed in as yourself. This leaves the Darwin CLI login untouched, and would likely
  unblock MO-011 as a side effect, which has been stuck on exactly this.

I would take the token route. It is one credential, it does not disturb the Darwin session, and
§14.2 already calls a Vercel token a tier-2 bootstrap credential — "once per account, you, paste
into the wizard" — so it is the documented path rather than a workaround.

~

## ❗ 2. The kit is unblocked — which piece first? · `claude`

MO-004 (`/hq` auth via Firebase custom claims), MO-005 (dashboard shell), MO-006 (analytics).
All three were blocked on the kit having agreed content; MO-045 settled that.

**I would do MO-004 first.** It is the one with a settled design already written down — §10.1 is
specific about custom claims gating both the route and the Firestore data, and `decisions.md`
records why it is not Auth.js or Cloudflare Zero Trust. MO-005 renders something; without auth it
renders it to everyone. MO-006 is the least coupled and could go any time.

Any objection, or shall I take MO-004 next session?

~

## ✅ 3. Primitives only — settled, with tests holding it there · `claude`

Shipped in #41. The code already emitted primitives; what was missing is that it read as a
placeholder — *"inventing a shared vocabulary from a sample of one would be guessing"* invites the
next person to add one once there are two. It is now a dated decision in the doc comment,
`.agent/decisions.md` and §15.1a.

Three tests pin it, including a count assertion so an addition fails rather than passing quietly
next to the existing expectations. The failure mode here is additive and social: nobody removes
primitives-only, somebody adds `--action-primary` because a project needed it and the kit was
right there.

## ✅ 4. Reconcile now refuses work that was not done · `claude`

Shipped in #42. You left this to me, so: I built it, having argued against it.

My objection was that two places deciding one thing will disagree — but that was an objection to
**duplication**, not to the second check. `hasNoSubstantiveChange` now lives in `src/paths.ts`
with two callers, which is ordinary defence in depth. I had conflated "two places enforce this"
with "two places define this".

What decided it: a gate only covers what passes through it, and all three historical instances
merged green because the rule did not exist when they merged.

Verified against real data rather than only unit tests — `morpheus pm ship --check` here now says:

```
1 item(s) NOT shipped — the merged PR changed only records and
board files, so it did not do the item's work:
  MO-010  mo-010-simplify-architecture-md-for-first-time (#31)
```

Strictly better than before, which called MO-010 a possibly-deliberate reopen. It was not
ambiguous; it was a PR that did none of the work.

## Parked

**Lakina's Vercel team.** Waiting on you, as you said. When you want it: project-scoped access is
Enterprise-only, so it needs its own Pro team — but Alex's Viewer seat is free and can comment on
previews, so it is one paid seat.

**Committing your inbox replies would red CI.** Unchanged and still un-actioned. `inbox validate`
cannot tell "the agent left no reply slot" from "the human used the slot". Only bites if you push
replies to a branch; you have been editing on `main`, so it has not. Tell me if it is worth an
item.

**Item dates roll over at 8pm your time.** `created:` and `updated:` are stamped in UTC, so
MO-045 and MO-046 both read `2026-07-30` though you decided them on the 29th. Cosmetic, and I have
kept the archive filenames on local time so the timeline still reads correctly. Worth an item only
if the board dates ever need to match your day.

**MO-011** — blocked on a Vercel token. Item 1 likely resolves it.

**Evo brand build.** Yours and the Evo session's.

**Google billing.** Unchanged — no Darwin billing account, `OR_BACR2`, nothing needs it.

**MO-010, simplify `architecture.md`.** `backlog`, not started, and §15.1a and §12.3 both grew
today.
