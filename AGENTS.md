# Morpheus — agent instructions

Read this before doing anything. `CLAUDE.md` is a symlink to this file so Claude and Codex
read the same instructions.

## What this repo is

Morpheus scaffolds new company repositories and maintains the reusable packages they depend
on. Read [`architecture.md`](./architecture.md) before making structural changes — it is the
specification, and it is more current than the code.

This repo is `kind: internal`. It has `hq/product/` and nothing else under `hq/` — no brand,
marketing, finance, or support, because Morpheus is a tool, not a company.

## Layout

| Path | What |
|---|---|
| `architecture.md` | The specification. Update it when a decision changes. |
| `src/pm/` | Project management: schemas, parser, index generator |
| `src/cli/` | The `morpheus` command |
| `hq/product/` | Morpheus's own roadmap and goals — it eats its own dog food |
| `.github/workflows/` | Reusable workflows called by every project |
| `tests/` | Vitest, mirroring `src/` |
| `.agent/journal/` | What was attempted and learned, including dead ends |

## Commands

```sh
pnpm install
pnpm typecheck             # tsc --noEmit
pnpm test                  # vitest run
pnpm build                 # tsc -p tsconfig.build.json
pnpm morpheus pm validate   # validate hq/product frontmatter
pnpm morpheus pm index      # regenerate README index tables
pnpm morpheus pm new roadmap "Title here" --priority P1
```

## Working conventions

**Pick up work from `hq/product/roadmap/`.** Move an item to `in-progress` when you start and
`review` when you open the PR. Branch names derive from the id: `rm-014-short-slug`.

**Every PR must carry:**

- Tests for anything testable — a source change with no test change needs an explicit reason
- A documentation update when behaviour or a public API changes
- A test plan: what you verified and how
- Any open questions you could not resolve, stated plainly rather than guessed at
- The roadmap item moved to `review`

**Before opening a PR**, run `pnpm typecheck && pnpm test && pnpm morpheus pm index`, and commit
any index changes. CI runs the same checks and will fail otherwise.

**Append a journal entry** to `.agent/journal/YYYY-MM-DD-slug.md` before opening a PR. Record
what you learned, especially dead ends that produced no code — git history cannot capture those.
Read `.agent/learned.md` at the start of a session.

## Style

Match the surrounding code. This codebase favours:

- Small, single-purpose modules with named exports
- Explicit types at boundaries; inference inside
- Errors surfaced as data (`ParseIssue[]`) rather than thrown, so one bad input cannot abort a
  batch — see `src/pm/parse.ts`
- Comments that explain *why*, not *what*. The YAML-date preprocessing in `src/pm/schema.ts` is
  the model: it exists because YAML silently converts unquoted dates, and that is not obvious.

## Things that have bitten us

- **YAML converts unquoted `2026-07-01` into a Date object.** Frontmatter dates go through
  `isoDate`, which normalises both forms.
- **A colon in a title breaks YAML.** `pm new` quotes scalars defensively; hand-written
  frontmatter with a colon must be quoted.
- Generated files (`hq/product/*/README.md` between the `morpheus:` markers) are never edited by
  hand. Change the item files and regenerate.
