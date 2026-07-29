---
owner: cpheinrich
date: 2026-07-29
agents:
  - claude
previous: .agent/inbox-archive/2026-07-29-0900-cpheinrich.md
---

# Inbox — 2026-07-29

**The GCP block cleared.** `dh-darwin` and `dh-evo` exist with Firebase, Firestore in `nam5`, and
Google sign-in on Evo — all on Spark, no billing. The root cause of that long 403 was unaccepted
Firebase Terms of Service, not IAM or org policy.

**Shipped since the last cycle:** the brand wizard ([RM-014](product/roadmap/RM-014.md)) and
`morpheus access sync` — access declared in `morpheus.json` and applied as Firebase custom
claims, so granting it is a reviewable commit. **88 tests, CI green on both repos.**

Evo is fully retrofitted and has its own inbox now. Two PRs open there, both yours to merge.

> `❗` needs you and ends in an empty `~`. `✅` is settled. Reply after the empty `~`.

## ❗ 1. Working on Evo — yes, use a fresh session · `claude`

~ *(previous: should I create a new Claude session for the Evo roadmap work?)*

**Yes, and start it in `~/darwin/evo`.** Two reasons that actually matter:

**Context relevance.** This session holds twelve hours of Morpheus design argument — naming
rounds, the Firebase debugging, org policy archaeology. Almost none of it helps someone building
Evo's brand pages, and it crowds out what does.

**Evo now has its own memory.** I just created `.agent/decisions.md` and `.agent/learned.md`
there, seeded with what is true about Evo specifically — the educational-only constraint the
product exists under, that the live surface wins over brand documents, that `apps/web` has no
Firebase dependency yet, and that the 18 calculator tests run via `node` rather than Vitest. A
fresh session reads those and starts informed rather than blank.

**Use this session for Morpheus itself** — the kit, `init`, templates. Use Evo's for Evo. Claims
(`morpheus pm claim`) stop the two from colliding if they ever touch the same item.

**A gap this exposed:** the Evo retrofit produced `hq/product/` but no `hq/inbox/` and no
`.agent/`, because both conventions postdate it. `morpheus init` has the same hole. Filed as
[RM-015](product/roadmap/RM-015.md) — and the important half is that `init` must **seed** those
files from the wizard answers, since an empty `decisions.md` reads as "nothing was decided"
rather than "nobody wrote it down".

~

## ❗ 2. Two Evo PRs to merge · `claude`

~ *(new)*

Both are config, no behaviour change:

- **[evo#7](https://github.com/darwin-health/evo/pull/7)** — the `/hq` allowlist, account
  bindings, `.agent/` memory, `hq/inbox/`, and inbox validation in CI

[evo#6](https://github.com/darwin-health/evo/pull/6) already merged and is deploying.

Your Evo inbox is at
[`hq/inbox/cpheinrich.md`](https://github.com/darwin-health/evo/blob/config-hq-access/hq/inbox/cpheinrich.md)
on that branch — it goes live when you merge.

~

## ✅ 3. Firebase, auth, and access — done · `claude`

`dh-darwin` and `dh-evo`: Firebase added, Firestore `nam5` (permanent), Google sign-in enabled on
Evo with public-facing name "Evo".

`morpheus access sync` applies the `morpheus.json` allowlist as custom claims — you as `admin`,
Robbie as `employee`. Both report **pending** until first sign-in, which is correct: a Firebase
Auth user does not exist until then, and re-running completes the grant. Revocation is included,
so the list is authoritative rather than merely additive.

**The 403 was unaccepted Firebase Terms of Service.** Not IAM, not OAuth scope, not org policy —
and the error named none of them. Once you accepted the terms for Darwin, the CLI provisioned Evo
first try. In `.agent/learned.md` with the general lesson: when a Google API refuses despite
Owner, check whether the product's terms were ever accepted before touching IAM.

You also now hold `organizationAdmin` and `orgpolicy.policyAdmin` on the org — nobody did before,
and that would have bitten you again with Cloud Run, Cloud Build, or Vertex AI.

## ✅ 4. The committed screenshot — removed · `claude`

~ *(previous: don't store image assets in git; delete it and move on)*

Deleted, images gitignored repo-wide with an exception for `hq/brand/assets/`. Cause was my
`git add -A` sweeping up what Nimbalyst wrote to `hq/inbox/assets/`. Recorded, along with the
rule to prefer explicit paths over `-A` when an editor keeps its own scratch state. Not purging
history, as you said.

## Parked

**Google billing.** No Darwin billing account exists and there is no non-trial path to create
one; the trial flow fails with `OR_BACR2`. Nothing needs it — Spark covers Auth and Firestore.
Options when you return: link your personal account (two commands, reversible), or contact sales.

**PostHog.** Two organizations, one per billing entity. Blocked on nothing.
