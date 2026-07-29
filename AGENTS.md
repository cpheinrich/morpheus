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
| `.agent/decisions.md` | Settled choices and why — **read this first** |
| `.agent/status/` | Archived status reports with Chris's inline replies |
| `hq/STATUS.md` | The live status report Chris replies to |

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

**At the start of a session** read `.agent/decisions.md` and `.agent/learned.md`. Decisions are
settled choices — if one looks wrong, say so and ask rather than quietly working around it.

## The status cycle

`hq/STATUS.md` is how Chris and I exchange state. It is the only file he is expected to edit.

1. I write it at the end of a working session. Everything needing his input goes in a single
   **Needs you** section, numbered, each item followed by a `~` on its own line.
2. He replies inline after the `~`, leaving the marker in place.
3. On my next turn I: read the replies, act on them, promote anything durable to
   `.agent/decisions.md`, archive the whole exchange to `.agent/status/YYYY-MM-DD-HHMM.md`,
   and write a fresh `STATUS.md`.

**Markers.** Three, and the distinction matters because Chris scans rather than reads:

**Every item is either closed or open. Never both, never neither.**

| State | Shape |
|---|---|
| **Closed** | `~` his reply → `✅` my answer. **No new slot.** |
| **Open** | `~` his reply → `!!` my answer → **`~` on its own line** for him to reply into |

Two mistakes to avoid, both made in the first round:

1. **`!!` without a following `~`.** He has nowhere to answer. Every `!!` needs an empty reply
   slot beneath it — the `~` at the top of an item is his *previous* reply, not a fresh one.
2. **`✅` on an item that still asks a question.** If there is a question, it is open. Marking
   it closed makes the `✅` meaningless as a scan signal.

Use `!!` once, at the start of the answer, rather than repeating it at the end — the trailing
`~` is what marks where to reply.

**Link roadmap items with relative markdown paths** — `[RM-011](product/roadmap/RM-011.md)`
from `hq/STATUS.md`. These resolve in Obsidian *and* render on GitHub, unlike `[[wikilinks]]`
which only work in Obsidian.

Keep **Needs you** as one list. Splitting "waiting on you" from "blocked" was a false
distinction — both mean the same thing to the person reading it.

Never let `hq/STATUS.md` accumulate history. It is a snapshot; the archive is the record.

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
