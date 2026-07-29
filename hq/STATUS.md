# Status — 2026-07-29

> **How to reply:** type your answer after the `~` under any item. Leave the `~` in place.
> On my next turn I read your replies, act on them, promote anything durable to
> `.agent/decisions.md`, archive this file to `.agent/status/`, and write a fresh one.
>
> Items are numbered so you can also just say "3 and 5 are done" if that's easier.

---

## Needs you

Everything that blocks me, in one list.

### 1. Review [darwin-health/evo#6](https://github.com/darwin-health/evo/pull/6) — the retrofit

Structural only: no behaviour, route, or dependency changes. Both CI jobs pass. Install,
token build, typecheck, lint, and `next build` verified; all 8 calculator routes still
prerender.

~

### 2. Vercel Root Directory → `apps/web`

The one red check left on evo#6. It's a dashboard setting, about thirty seconds. Your Vercel
CLI is authenticated as `darwinhealthinc-4781` so I *could* force it, but reconfiguring a live
deployment unsupervised isn't a call I should make. Say the word and I will.

~

### 3. Merge ordering for evo#6

`codex/tool-tests-ci` has one unmerged commit. A move this wide conflicts with any in-flight
branch — land that first, or rebase it after. Which?

~

### 4. `gcloud auth login` as yourself

The biggest unblock. No credentialed account since the Polycam revoke, so there's no GCP or
Firebase project. This gates RM-004 (`/hq` auth) and effectively the entire infrastructure
half of the roadmap.

~

### 5. PostHog account + API key

Blocks RM-006 and Evo's RM-003. Free tier covers you for a long time.

~

### 6. Publish `morpheus-kit` to npm, or not?

PolyForm Noncommercial plus `private: true` makes this a real question rather than a step. The
CI workaround (checking out and building the CLI) works fine, so there's no urgency — but
`morpheus init` for a fresh project would be nicer if the package were installable.

~

### 7. Event schema input for RM-006

The expensive thing to get wrong. What do Darwin and Evo actually need to measure? Even three
bullet points beats a schema I invent. Specifically: is there a canonical set every project
emits (signup, activation, purchase) so cross-project dashboards work, or is each project's
schema its own?

~

---

## Shipped

| Item | What |
|---|---|
| **RM-001** | `morpheus pm` — schemas, parser, index generator, CLI |
| **RM-002** | `morpheus check pr` + four reusable workflows |
| **RM-007** | Evo retrofit → [evo#6](https://github.com/darwin-health/evo/pull/6) |
| **RM-010** | Added (architecture.md simplification, deferred by design) |

42 tests, Morpheus CI green, `pnpm audit` clean, Evo CI green on the PR.

---

## What the retrofit taught us

**Two genuine template bugs, both found only by applying the templates to a real project:**

1. **`web-ci` hard-failed on missing scripts.** Evo's `apps/web` had no `typecheck` or `test`.
   The template encoded what *Morpheus* looks like — a repo with full tooling — rather than
   what a young project looks like. Fixed with `pnpm run --if-present`.
2. **`pm-check` assumed the consuming repo had the CLI installed.** Evo doesn't and can't until
   the package is published. Now the workflow checks out `cpheinrich/morpheus` and builds the
   CLI — only possible because the repo is public, the first concrete payoff of that decision.

**Three smaller findings:** the move was mechanical (no imports crossed out of `web/`); three
`.npmrc` files existed only to escape a Polycam registry that no longer exists; package names
needed scoping to `@evo/*`.

**On `@main` pinning:** my `--if-present` fix landed one minute after Evo's CI ran, so the first
run used a stale workflow. Instant propagation cuts both ways. Related trap — `gh run rerun`
reuses the *original* workflow resolution, so a reusable-workflow fix needs a fresh trigger.

---

## Next, in order

1. evo#6 merged and the Vercel root directory fixed
2. `gcloud auth login` → RM-004 (`/hq` auth), the gateway to the infra half
3. RM-008 `morpheus init`, written from the five findings above
4. RM-009 Darwin retrofit — the real test of the templates

## Not done, deliberately

**RM-006 analytics** — see item 7. **RM-009 Darwin retrofit** — Darwin has a live `/hq` with
`financials`, `suppliers`, and `legal`, materially riskier than Evo, and better done after
`init` exists so it tests the templates rather than repeating hand work.

---

## Anything else

~
