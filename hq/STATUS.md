# Status — 2026-07-29

> Ephemeral. Overwritten each working session. The durable record is
> [`hq/product/roadmap/`](./product/roadmap/) and `.agent/journal/`.

## Shipped this session

| Item | What |
|---|---|
| **RM-001** | `morpheus pm` — schemas, parser, index generator, CLI |
| **RM-002** | `morpheus check pr` + four reusable workflows |
| **RM-007** | Evo retrofit → [darwin-health/evo#6](https://github.com/darwin-health/evo/pull/6) |
| **RM-010** | Added (architecture.md simplification, deferred by design) |

42 tests, CI green, `pnpm audit` clean.

## Needs your review

**[darwin-health/evo#6](https://github.com/darwin-health/evo/pull/6)** — the Evo retrofit.
Structural only, no behaviour changes. Verified: install, token build, typecheck, lint, and
`next build` all pass, all 8 calculator routes still prerender.

One thing to decide before merging: **`codex/tool-tests-ci` has an unmerged commit**, and a
move this wide conflicts with any in-flight branch. Either land that first, or rebase it after.

## Blocked on you

| Blocker | Unblocks | Why |
|---|---|---|
| `gcloud auth login` as yourself | RM-004, most infra | No credentialed account since the Polycam revoke — no GCP or Firebase project exists |
| A PostHog account + API key | RM-006, Evo RM-003 | Cannot wire analytics without a project |
| Decide: publish to npm or not | RM-003 | PolyForm Noncommercial + `private: true` makes public npm a real question, not a step |
| Event schema input | RM-006 | What Darwin and Evo actually measure — I'd rather ask than invent |

## What the Evo retrofit taught us

The point of doing it by hand. Five findings, all recorded in RM-007:

1. **`web-ci` hard-failed on missing scripts.** Evo's `apps/web` had no `typecheck` or `test`.
   Fixed with `pnpm run --if-present` — a template must not require a script a young project
   has not written yet. **This is the template bug the retrofit existed to find.**
2. **The move was mechanical.** `web/` had zero imports crossing out of it, so no rewrites.
   `init` can assume that; `add` against an established repo cannot.
3. **`.npmrc` overrides were archaeology** — three files escaping a Polycam registry that no
   longer exists. Retrofits should hunt for workarounds whose cause is gone.
4. **Package names needed scoping** — `web`/`shared` → `@evo/web`/`@evo/shared`.
5. **A wide move conflicts with every in-flight branch.** A sequencing constraint worth
   writing down rather than discovering twice.

## Next, in order

1. You merge or comment on evo#6
2. `gcloud auth login` → unblocks RM-004 (`/hq` auth), the gateway to the infra half
3. RM-008 `morpheus init`, written from the RM-007 findings above
4. RM-009 Darwin retrofit — the real test of the templates

## Not done, deliberately

**RM-006 analytics.** I could have written an event schema without credentials, but I flagged
it earlier as the expensive thing to get wrong, and I'd be guessing at what Darwin and Evo
actually measure. Three questions from you beats a schema I invented.

**RM-009 Darwin retrofit.** Darwin has a live `/hq` with `financials`, `suppliers`, and
`legal`, which makes it materially riskier than Evo. Worth doing with you present, and better
done after `init` exists so it tests the templates rather than repeating hand work.
