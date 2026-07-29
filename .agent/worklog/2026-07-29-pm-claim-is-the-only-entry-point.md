# 2026-07-29 — `pm claim` as the only documented entry point (MO-041)

## The ask

Chris: "Hand-naming branches has failed `check pr` three times. Make `pm claim` the only
documented way to start work." Plus, from the inbox: "The rule is not the problem; recalling it at
`git checkout -b` is."

## What was actually wrong

Not the rule — `AGENTS.md` already said "Never create the branch by hand", and the scaffolded
`AGENTS.md` that `init` writes into every new project said it too. Two other things:

**The specification still showed the old shape.** §12.3 step 2: *"Work happens on a branch named
`rm-<id>-<slug>`."* Wrong prefix — `rm-` predates the per-project prefixes — and wrong verb. "A
branch named X" describes something a person types. Nobody types it; `pm claim` derives it. Two
more instances at the mermaid diagram (§9) and §21, plus `rm-014-*` in `decisions.md`.

**`check pr` reported the violation without the recovery.** It fires after the work is done, when
the branch is expensive to rename, and it is the one moment someone is certainly reading. It said
what was wrong and not what to do.

## What I did not do, and why

Considered and rejected two enforcement mechanisms:

- **A pre-push hook** refusing a branch that stakes no id. Catches it early, which is the right
  instinct, but hooks need installing, do not travel with a clone, and would need `init` to write
  them into five existing repos.
- **`morpheus pm start "<title>"`** collapsing `pm new` + `pm claim` into one command, on the
  theory that people reach for `git checkout -b` because the correct path is two commands and the
  wrong one is one.

The second is genuinely tempting and I nearly built it. Rejected because it adds surface to solve
what the evidence says is a documentation problem — all three failures were an agent following a
stale spec, not an agent finding two commands burdensome. `.agent/decisions.md` has the stopping
rule for exactly this: *name it well enough that a fresh agent reads it correctly on first
encounter, then document the rest.* Raised in the PR as an open question rather than decided
unilaterally, since Chris is the one who has hit the friction.

## Verified

- `pnpm typecheck`, `pnpm test` — 253 passing, up from 251
- Two new tests assert the recovery command appears in each failure message, which is the part
  that regresses silently if someone rewords them

## Note on a flaky-looking run

One `pnpm test` reported 146 passed / 7 errors with a 975-second duration, where tests themselves
took 1.55s. Re-ran clean at 253/1.61s, twice. Environment contention, not the suite — a parallel
session is working in this same checkout and `git` hit an `index.lock` conflict a few minutes
earlier. Recording it so the next person who sees it does not go hunting for a real failure.
Worth watching: if it recurs without a parallel session, it is real.
