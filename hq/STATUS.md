# Status — 2026-07-29

> Ephemeral. Overwritten each working session. The durable record is
> [`hq/product/roadmap/`](./product/roadmap/) and `.agent/journal/`.

## Shipped

| Item | What |
|---|---|
| **RM-001** | `morpheus pm` — schemas, parser, index generator, CLI |
| **RM-002** | `morpheus check pr` + four reusable workflows |
| **RM-007** | Evo retrofit → [darwin-health/evo#6](https://github.com/darwin-health/evo/pull/6) |
| **RM-010** | Added (architecture.md simplification, deferred by design) |

42 tests, Morpheus CI green, `pnpm audit` clean. Evo CI green on the PR.

## Waiting on you

**1. Review [darwin-health/evo#6](https://github.com/darwin-health/evo/pull/6).** Structural
only — no behaviour, route, or dependency changes. Both CI jobs pass; install, token build,
typecheck, lint, and `next build` all verified, all 8 calculator routes still prerender.

**2. Vercel Root Directory needs changing to `apps/web`.** The preview deploy is the one
remaining red check on that PR. It's a dashboard setting, and I didn't want to reconfigure a
live deployment unsupervised — takes you about thirty seconds.

**3. Merge ordering.** `codex/tool-tests-ci` has an unmerged commit. A move this wide conflicts
with any in-flight branch: land that first, or rebase it after.

## Blocked

| Blocker | Unblocks | Why |
|---|---|---|
| `gcloud auth login` as yourself | RM-004, most infra | No credentialed account since the Polycam revoke — no GCP or Firebase project exists |
| PostHog account + API key | RM-006, Evo RM-003 | Cannot wire analytics without a project |
| Decide: publish to npm or not | RM-003 | PolyForm Noncommercial + `private: true` makes this a real question, not a step |
| Event schema input | RM-006 | What Darwin and Evo actually measure — I'd rather ask than invent |

## What the retrofit taught us

The point of doing it by hand. All recorded in RM-007 and the journal.

**Two genuine template bugs, both found only by applying the templates to a real project:**

1. **`web-ci` hard-failed on missing scripts.** Evo's `apps/web` had no `typecheck` or `test`.
   Fixed with `pnpm run --if-present`. The template encoded what *Morpheus* looks like — a repo
   with full tooling — rather than what a young project looks like.
2. **`pm-check` assumed the consuming repo had the CLI installed.** It ran `pnpm morpheus`,
   which only works in a repo depending on morpheus-kit. Evo doesn't and can't until the
   package is published. Now the workflow checks out `cpheinrich/morpheus` and builds the CLI
   itself — **only possible because the repo is public, which is a concrete payoff of that
   decision.**

**Three smaller findings:**

3. The move was mechanical — `web/` had zero imports crossing out of it, so no rewrites.
   `init` can assume that for a fresh project; `add` against an established repo cannot.
4. Three `.npmrc` files existed only to escape the Polycam Artifactory registry that no longer
   exists. Retrofits should hunt for workarounds whose cause is gone.
5. Package names needed scoping — `web`/`shared` → `@evo/web`/`@evo/shared`.

**And one about the `@main` pinning you chose:** my `--if-present` fix landed one minute after
Evo's CI ran, so the first run used a stale workflow. Instant propagation cuts both ways. Also
worth knowing: `gh run rerun` reuses the *original* workflow resolution, so verifying a
reusable-workflow fix needs a fresh trigger, not a rerun.

## Next, in order

1. You merge or comment on evo#6, and fix the Vercel root directory
2. `gcloud auth login` → unblocks RM-004 (`/hq` auth), the gateway to the infra half
3. RM-008 `morpheus init`, written from the five findings above
4. RM-009 Darwin retrofit — the real test of the templates

## Not done, deliberately

**RM-006 analytics.** I could have written an event schema without credentials, but I flagged
it as the expensive thing to get wrong, and I'd be guessing at what Darwin and Evo measure.
Three questions from you beats a schema I invented.

**RM-009 Darwin retrofit.** Darwin has a live `/hq` with `financials`, `suppliers`, and `legal`
— materially riskier than Evo, and better done after `init` exists so it tests the templates
rather than repeating hand work.
