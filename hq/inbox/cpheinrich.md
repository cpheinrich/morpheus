---
owner: cpheinrich
date: 2026-07-29
agents:
  - claude
previous: .agent/inbox-archive/2026-07-29-1900-cpheinrich.md
---

# Inbox — 2026-07-29 (evening)

**The three things you wanted fixed rather than remembered are all fixed**, and chasing the third
one turned up something worse than the inconvenience you described. Five PRs merged: #33, #34,
#35, #37, #38. **271 tests, up from 242.**

`pm new` now allocates against the remote as well as local files — the repo had a live gap at
MO-038 while another session held it ([MO-040](product/roadmap/MO-040.md)). The specification no
longer documents any way to start work except `pm claim`, and `check pr` names the recovery
command in its failure messages instead of only reporting the violation
([MO-041](product/roadmap/MO-041.md)). An inbox cycle needs no roadmap item any more — **this
message is the first one riding its own `inbox-2026-07-29` branch** rather than borrowing an
item's ([MO-042](product/roadmap/MO-042.md)).

Your three questions from this afternoon are still open and repeated below, unchanged. The kit
decision is still the one blocking real progress.

> `❗` needs you and ends in an empty `~`. `✅` is settled. Reply after the empty `~`.

## ❗ 1. The board said MO-010 was shipped. It was never started · `claude`

This is what came out of "an inbox cycle has to ride on an unrelated branch". It is not an
inconvenience.

The last cycle rode `mo-010-simplify-architecture-md-for-first-time`. Merging it released the
claim, and reconcile did exactly its job: a merged PR whose branch staked MO-010, so
**[MO-010](product/roadmap/MO-010.md) went to `shipped` with `prs: [31]`** — a PR that changed
only `hq/inbox/` and `.agent/inbox-archive/`. The inbox inside that very PR says "MO-010,
simplify `architecture.md`. Claimed, not started."

I audited every shipped item against what its PR actually changed. Two more:

- **MO-015** — "init must scaffold .agent and hq/inbox", credited to PR #2, which was a
  `learned.md` entry on `mo-015-empty-dirs`. The work was really PR #22. Substance shipped,
  attribution wrong; corrected.
- **MO-003** — records-only too, but legitimate: that item's deliverable *was* the decision not
  to publish.

MO-010 is back to `backlog` with a note saying why. A records-only PR on a claimed branch is now
blocked, waivable with `records-only: <reason>` for the MO-003 case.

**The question.** `check pr` is the gate, but it can be bypassed — all three of these merged green
because the rule did not exist yet. **Reconcile is the last line, and it currently trusts the
branch name completely.** Should `pm ship` also refuse to mark an item shipped when the merged PR
has no substantive change? I did not add it, because reconcile writes the board and I would rather
not have two places deciding the same thing without you.

~

## ❗ 2. The kit — still the one decision that blocks progress · `claude`

Unchanged from this afternoon, and still the thing standing between here and MO-004/005/006.

Three projects have independently hand-rolled the same script: turn brand tokens into CSS custom
properties. That is the extract-on-second-use trigger, passed twice over.

**The decision:** heinrichbros maps tokens to *semantic* names (`--ember` from `color.vermilion`,
`--forest` from `color.pine`), while cpheinrich.com emits primitives verbatim
(`--brand-color-ink`). Architecture §15.1a says primitives → semantic → generated, so the semantic
layer is meant to exist — but only one project has one, and its mapping is bespoke.

Do I generate primitives only and let each project define its own semantic layer, or make the
semantic layer part of the kit with a per-project mapping file?

~

## ❗ 3. Three retrofit PRs still waiting on you · `claude`

Unchanged. All still green, all still mine to write but not to merge — I have standing
authorization in Morpheus and Evo, not in these.

- [cpheinrich/cpheinrich.com#1](https://github.com/cpheinrich/cpheinrich.com/pull/1)
- [heinrichbros/heinrichbros.com#1](https://github.com/heinrichbros/heinrichbros.com/pull/1)
- [lakinacapital/lakina#3](https://github.com/lakinacapital/lakina/pull/3)

**The thing to look at rather than trust:** in the first two I moved `brand/` to `hq/brand/` and
broke their token-generation scripts, because I did not grep for references first. Both were green
on `main` before me. Fixed and re-verified, but it is the kind of mistake worth seeing.

~

## ❗ 4. Your Evo brand answers are done but never built · `claude`

Unchanged, and still Evo-session work rather than this one's. `hq/brand/answers.md` in Evo is
complete; `morpheus brand build` was never run, so no `strategy.md`, no `messaging.json`, no
`explore-prompt.md`.

Minor: you answered `visualSource` with prose — *"apps/web (live at https://evo.med; canonical
current tokens are in packages/shared/tokens/)"*. The field expects a path, so `brand status`
renders it as `→ tokens.json — canonical at apps/web (live at …)`. Trim to
`packages/shared/tokens/` if you want it to read cleanly.

Do you want me to run the build from an Evo session next time, or are you doing it?

~

## ❗ 5. Something is rewriting your inbox file, and it is not Morpheus · `claude`

Mid-session `hq/inbox/cpheinrich.md` appeared modified without my touching it: `date: 2026-07-29`
rewritten to `date: 2026-07-29T00:00:00.000Z`, and a blank line dropped.

I could not reproduce it from `inbox validate` or `init status` — both leave the file alone. The
signature is a YAML serializer round-trip, which fits Nimbalyst saving the file, and matches the
`learned.md` note that YAML reads an unquoted date as a `Date` object.

Harmless in content, but it makes spurious diffs and `git add -A` would commit them. **Did you
have the inbox open in Nimbalyst this afternoon?** If so I will quote the date in the frontmatter
we generate, which stops the round-trip at the source. I reverted the reformat rather than
committing it.

~

## ✅ 6. `pm new` was one merge away from re-issuing a live id · `claude`

Not hypothetical. Local `main` ran MO-001…MO-037 and then MO-039; the gap at 38 was another
session holding `mo-038-…` on a branch that had not merged. Item files only ever hold ids that
have **merged**, so allocation could not see it.

It only failed to bite because MO-039 merged an hour earlier and pushed the local maximum past 38.

`nextId` now takes the maximum across local files and `git ls-remote`. When origin is unreachable
it still allocates but says so, rather than letting a network blip render as a free id — the
fourth entry now under *never let an unanswerable question render as a confident answer*.

## ✅ 7. `hq/onboarding.md` said `# T — setup` · `claude`

Committed that way since PR #23, which was about detectors and had no reason to touch it. Someone
passed `--name T` while testing and the regenerated file was swept into the commit.

The mechanism mattered more than the value: the heading came from the directory name, never from
`morpheus.json`, which declares `displayName: Morpheus`. Since you asked for one worktree per
parallel session, a worktree in `morpheus-mo-044` would have rewritten it again — every session
fighting over the heading. Now read from the manifest, per *the registry indexes; the manifest is
authoritative*.

## ✅ 8. I got the MO-042 fix wrong and caught it after merging · `claude`

Worth recording rather than quietly patching. #35 claimed its new rule blocked "the exact
configuration that shipped MO-010". It did not — checked against PR #31's real file list, the
predicate returns `false`. A borrowed branch always carries `hq/product/` files, because claiming
reconciles statuses and `pm index` regenerates the tables into the same commit.

I had written the rule from the *description* of the incident rather than its diff. The
description was accurate, the diff was messier, and the rule fitted the tidy version. #37 fixes it
with a second predicate, and its tests use the actual file lists from PR #31 and PR #2 so it is
anchored to the real events.

The general form is now in `learned.md`: **when a rule is written from a remembered example rather
than the example's actual diff, it describes a tidier version of the event than the one that
happened.**

## Parked

**Board reconciliation.** MO-044 still reads `review` on `main`. By design — reconcile runs at
claim time, so the next session's first claim sweeps it up. Same as MO-039 last time.

**MO-011** is genuinely blocked, needing a Vercel token; the CLI's `auth.json` returns
`invalidToken`.

**Google billing.** Unchanged — no Darwin billing account, trial flow fails with `OR_BACR2`,
nothing currently needs it.

**MO-010, simplify `architecture.md`.** Back to `backlog` and genuinely not started. It grew again
today: §12.3 gained a paragraph on why `pm claim` is the only entry point.
