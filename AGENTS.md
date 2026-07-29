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
| `.agent/inbox/` | Archived inbox cycles with inline replies, date-first |
| `hq/inbox/<handle>.md` | Live inboxes — one per person by GitHub handle |

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

**Claim work before starting it:**

```sh
morpheus pm claims           # what is already taken
morpheus pm claim RM-014     # stakes the branch on origin, sets in-progress, pushes
```

The remote branch **is** the claim — `pm claim` refuses if `origin` already has `rm-014-*`.
Never start an item without claiming it; another agent, possibly on someone else's machine,
may be on it. Move the item to `review` when you open the PR. Merging deletes the branch and
releases the claim.

Run one **git worktree per parallel session** so two agents cannot collide in the same
checkout.

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

## The inbox cycle

`hq/inbox/<handle>.md` is how a human and their agents exchange state. These are the only
files a human is expected to edit.

**One inbox per person, not per session.** A person's file collects items from every agent
working for them, each heading tagged with the agent that raised it (`` `claude` ``,
`` `codex` ``). Two agents share a working copy so writes serialise; two *people* never touch
the same file, so git never merges a status.

1. I write it at the end of a working session: **a prose summary of what got done first**, then
   numbered items, each ending in a `~`. Summary-before-blockers is the order a human expects.
2. He replies inline after the `~`, leaving the marker in place.
3. On my next turn I: read the replies, act on them, promote anything durable to
   `.agent/decisions.md`, archive the whole exchange to
   `.agent/inbox/YYYY-MM-DD-HHMM-<handle>.md` (date first, so the archive reads as one timeline), and write a fresh inbox.

**Markers.** Three, and the distinction matters because Chris scans rather than reads:

**Every item is either closed or open. Never both, never neither.**

**The state lives in the heading**, not inline — `❗` and `✅` carry colour, so scanning does not
depend on the renderer's text colour. Items are `##` with no wrapping section header, because
Nimbalyst dims each descending heading level.

| State | Shape |
|---|---|
| **Closed** | `## ✅ 2. Title · \`claude\`` → answer, **no reply slot** |
| **Open** | `## ❗ 1. Title · \`claude\`` → answer → **`~` on its own line** to reply into |

Two mistakes to avoid, both made in the first round:

1. **`❗` without a following `~`.** He has nowhere to answer. The `~` at the top of an item is
   his *previous* reply, not a fresh one.
2. **`✅` on an item that still asks a question.** If there is a question, it is open.

`morpheus inbox validate` enforces both, plus dense numbering, the GitHub-handle rule, and a
summary before the first item. Run it before finishing; CI runs it too.

**Link roadmap items with relative markdown paths** — `[RM-011](product/roadmap/RM-011.md)`
from `hq/STATUS.md`. These resolve in Obsidian *and* render on GitHub, unlike `[[wikilinks]]`
which only work in Obsidian.

Keep **Needs you** as one list. Splitting "waiting on you" from "blocked" was a false
distinction — both mean the same thing to the person reading it.

Never let an inbox accumulate history. It is a snapshot; the archive is the record.

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
