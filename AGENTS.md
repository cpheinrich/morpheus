# Morpheus — agent instructions

Read this before doing anything. `CLAUDE.md` is a symlink to this file so Claude and Codex
read the same instructions. It holds the rules every task needs; detail lives in runbooks that
the **Read when** pointers below name — open one when its trigger applies, not before.

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
| `src/gh-manager/` | The GitHub Manager: sweep, session brief, decision checks — see its runbook |
| `src/init/templates.ts` | What every scaffolded project's `AGENTS.md` and files say — keep aligned with this file |
| `hq/product/` | Morpheus's own roadmap and goals — it eats its own dog food |
| `.github/workflows/` | Reusable workflows called by every project |
| `docs/runbooks/` | Procedures, for humans and agents — read on demand (index below) |
| `.github/agent-review-prompt.md` | The rung-2 reviewer persona — versioned, so it is reviewable |
| `.claude/skills/` | Named, repeatable procedures — `voice-handoff`, `voice-import` |
| `.agents/skills/` | Repository-owned Codex skills, copied into every scaffold — `motion-design-exploration` |
| `local/handoffs/` | Handoff docs, both directions. Gitignored — never committed |
| `qa/acceptance/` | Acceptance criteria per item, named by `RoadmapItem.acceptance` |
| `tests/` | Vitest, mirroring `src/` |
| `.agent/worklog/` | What was attempted and learned per task, including dead ends |
| `.agent/decisions.md` | Settled choices and why — **read this first** |
| `.agent/inbox-archive/` | Past inbox cycles with replies, date-first |
| `hq/team/<handle>.md` | Live inboxes — one per person by GitHub handle |
| `hq/team/members.md` | The roster — handles, names, and how to work with each person |
| `hq/team/meeting-notes/` | Distilled meeting summaries, never transcripts |

### Runbooks — read when

| Read | When |
|---|---|
| [`pm-workflow.md`](docs/runbooks/pm-workflow.md) | Filing or claiming an item, roadmap ids and slugs, blocking/resuming, records-only or meeting-note PRs, waivers, closing issues, visual evidence, or `check pr` refuses |
| [`independent-review.md`](docs/runbooks/independent-review.md) | Before spawning a reviewer, and before writing the review record — budgets, turns, finalization, conditions, record fields |
| [`context-freshness.md`](docs/runbooks/context-freshness.md) | A gated command refuses; offline; on a fork; hooks not firing; `context install` |
| [`device-bootstrap.md`](docs/runbooks/device-bootstrap.md) | Startup reports Morpheus stale or bootstrap required; installing codebase-memory |
| [`test-quality.md`](docs/runbooks/test-quality.md) | Writing or reviewing tests; before calling anything "tested" |
| [`inbox-cycle.md`](docs/runbooks/inbox-cycle.md) | Writing, answering or archiving an inbox |
| [`website.md`](docs/runbooks/website.md) | Any website, waitlist, signup/contact form, `/hq`, consumer auth, or a new Firebase project |
| [`gh-manager.md`](docs/runbooks/gh-manager.md) | A PR may sit unattended, or the manager has touched yours |
| [`folder-readmes.md`](docs/runbooks/folder-readmes.md) | Creating a directory, or deciding whether it needs a README |
| [`cli-commands.md`](docs/runbooks/cli-commands.md) | You need a command not listed below |

## Commands

```sh
pnpm install
pnpm typecheck                     # tsc --noEmit
pnpm exec vitest run tests/<file>.test.ts   # focused tests — see "Testing" below
pnpm test                          # full vitest run — at most once per PR, see below
pnpm compile                       # tsc -p tsconfig.build.json; refreshes committed dist/
pnpm morpheus pm index             # refresh goal/request indexes
pnpm morpheus pm new roadmap "Title" --slug verb-noun --priority P1 [--issue 123]
pnpm morpheus pm claim <ID>        # stake the branch; prints WORK IN for a fresh worktree
pnpm morpheus pm resume <ID>       # continue a claimed or blocked task
pnpm morpheus pm block <ID> --needs "what would unblock this"
pnpm morpheus review prepare --base origin/main   # the reviewer packet
pnpm morpheus inbox validate       # before finishing an inbox
pnpm morpheus context refresh      # once, after reading the records — see below
```

## Device bootstrap

Startup's `.morpheus/session-start.sh` diagnoses the CLI. Only when no device preference is saved
and startup reports automatic updates unconfigured, ask exactly: **"Morpheus is stale. Enable
automatic updates after pulls on this device?"** Do not infer consent; an existing choice is
honoured, never re-asked. Before structural code discovery run
`morpheus codebase-memory install --check`, and `morpheus codebase-memory install` if it is not
operational. **Read [`device-bootstrap.md`](docs/runbooks/device-bootstrap.md)** for what yes and no
run and for anything the shim reports.

## Context freshness

Run `morpheus context brief` at session start if the hook did not; follow its `WORK IN` path.

**Read `.agent/decisions.md`, `.agent/learned.md` and `hq/team/<your handle>.md` once at session
start, then run `morpheus context refresh` once.** After that, just run the gated command
(`pm claim`, `pm new`, `pm link-issue`, `pm block`, `access sync`, `firebase auth setup`,
`web init` provisioning). Past the five-minute term the gate re-checks trunk and the records itself and
re-certifies when nothing moved; read-only and mechanical commands are never gated.
**Refresh again only when a gated command refuses**, and then
re-read only what the refusal or the refresh names. Never pipe `refresh` output through
`head`/`tail` — the delta it prints is the point. **Do not refresh without reading**: the receipt
is your assertion, and one taken to clear a gate is the failure the protocol cannot detect.

Offline: `MORPHEUS_OFFLINE=1`. Forks, hooks, receipts and Codex hook trust: **read
[`context-freshness.md`](docs/runbooks/context-freshness.md)**; why: [`architecture.md` §7.10](./architecture.md).

## Working conventions

**Claim before starting**, with `morpheus pm claim <ID>` — the remote branch **is** the claim.
Never create the branch by hand. Use **one worktree per implementation task**: from a shared
checkout `pm claim` prints a fresh worktree; read its records, refresh there, and claim again
there. Do not run concurrent authors on one task worktree. **Name slugs like branches**
(`--slug update-roadmap-ids`, verb-noun, ≤ 32 characters). Ids, worktrees and resume:
[`pm-workflow.md`](docs/runbooks/pm-workflow.md).

**A request arriving in a conversation is intake, not a release path.** Messages, Slack, email,
voice and browser chat enter the same lifecycle: create or link the roadmap item, claim it, work
on its branch, test it, open a PR and merge it. A trusted author can authorize the work; the
channel cannot waive the records or review path. Never edit or release directly from a transcript.

**An external mutation ships with an exact target and proof.** Prefer a pasted one-shot CLI command
with explicit account, project and resource identifiers (console prose is fallback only), with a
caller-perspective verification probe and expected result beside it. Delivery is not acceptance:
close the item only with evidence of the user-visible result. Release jobs depend on
`cpheinrich/morpheus/.github/workflows/release-preflight.yml@main` and check out its `sha` output.
Do not extract a recurring production probe until a second project needs the same one.

**When you hit real ambiguity, block — do not guess:** `morpheus pm block <ID> --needs "<what would
unblock you>"`. Escalating is cheap; shipping half-baked is expensive. "Blocked on Chris" is not a
`needs`. A blocked item keeps its branch; resume with `pm resume`. Detail:
[`pm-workflow.md`](docs/runbooks/pm-workflow.md#blocking).

**Break loops.** If the same command fails the same way twice, or you have polled the same thing
three times, stop: change approach, or `pm block` with what you learned. Never idle-loop
(`sleep`/`true`/`echo` loops, repeated status checks); to wait on CI use
`gh pr merge --auto` or one `gh pr checks <n> --watch --fail-fast`.

**Browser-reachable work is not blocked.** If the *single, entire* obstacle is that something has
to happen in a browser — a console, a dashboard, a setting — do it yourself rather than describe
what someone should click. Where a human is wanted for **judgment** — spending, publishing,
sending, granting access — the gate stands; the browser changes nothing.

**Build vs. borrow — check before writing a generic module.** Before implementing anything not
specific to this domain — parsing, diffing, scheduling, retries, rate limiting, fuzzy search, date
handling, CLI plumbing — make one quick registry search for a maintained package; check its last
publish and dependency footprint. **Propose, don't decide silently — in either direction:** an ❗
inbox item when the choice shapes the architecture, a PR-body line ("considered X, built instead
because Y") when small. **Prefer lightweight:** build when the need is under ~100 lines,
domain-specific, or every candidate is unmaintained. Record the outcome in `.agent/decisions.md`.

**The authoring agent owns the entire review loop.** After committing, run
`morpheus review prepare --base origin/main` (it prints a packet; it launches nothing), spawn
**one fresh reviewer** with repository access and that packet and no inherited history, then
handle findings, the record, CI and merge yourself. Do not wait for a monitor, another agent or
GitHub Actions. If no independent session can be started, say so and leave the PR open with
auto-merge off — never self-review. **Read [`independent-review.md`](docs/runbooks/independent-review.md)
before spawning the reviewer**: it holds the turn cap, budgets and floors, timing evidence,
conditional clearance, finalization, `humanAuthorization`, record fields, the `review-record:`
line and the `agent-reviewed` label. Merge trunk rather than rebase after review.

**Every PR carries** tests for anything testable (or an explicit reason), a documentation update
when behaviour changes, a test plan with the commands actually run, open questions stated plainly,
the roadmap item moved to `review`, `Closes #N` for each issue in the item's `issues:`, and visual
evidence for paths under `review.visualEvidence`. A records-only change (`hq/team/`, `.agent/`)
goes on an `inbox-<YYYY-MM-DD>` branch; meeting notes go in isolated PRs; **never borrow an
unrelated item's branch**. Waivers (`skip-tests:`, `records-only:`) need a real reason. All of it:
[`pm-workflow.md`](docs/runbooks/pm-workflow.md#what-a-pr-carries).

**Append a worklog entry** to `.agent/worklog/YYYY-MM-DD-slug.md` before opening a PR — dead ends
especially. Decisions in `.agent/decisions.md` are settled; if one looks wrong, ask rather than
work around it ([`.agent/README.md`](.agent/README.md) relates the records).

### Testing: focused first

Run the tests for the files you changed and their direct dependents —
`pnpm exec vitest run tests/<area>.test.ts …` — while iterating. **CI runs the full suite and must
pass before merge.** Run the full `pnpm test` locally **at most once per PR**, and only when you
touched shared core (`src/pm/`, `src/check/`, `src/session/`, `src/review/`,
`src/init/templates.ts`). Never re-run an unchanged suite to see whether it passes this time.
Record the focused commands, and why that scope, in the test plan.

**Before opening a PR**, run `pnpm typecheck`, the focused tests, `pnpm compile` and
`pnpm morpheus pm index`, and commit any generated changes. CI runs the same checks.

iOS projects: focused tests only, with the repository's build/test wrapper and explicit test
filters; never the full iOS suite locally unless Chris asks. New projects inherit this from
`src/init/templates.ts`; keep it aligned.

### What makes a test count

"A test exists" is not the bar. **Assert the value, not the sign** — `> 0`, `!= 0`,
`is not None` and "did not raise" deserve a second look. **Test a guard at its boundary** —
`x <= 0` and `x < 0` differ only at zero. **A comment saying "never do X" needs a test that fails
when X is done.** **Coverage is a floor against deletion, not evidence of quality.** To check
rather than assume, mutation-test outside CI and read the survivors. Worked example and the three
reasons a mutant survives: [`test-quality.md`](docs/runbooks/test-quality.md).

## Branch protection

`main` is protected here and on every project repo. **Never push to `main`**; open a PR and merge
it yourself — Chris does not need to merge for you. Finish the independent review and CI first,
then `gh pr merge <n> --squash --auto --delete-branch`. **Never merge with `--admin`**, and never
use a delivery waiver to bypass independent review. Respond to every GitHub review finding;
explain declined ones in their threads before resolving. `pm claim` reconciles merged work to
`shipped`. Detail: [`pm-workflow.md`](docs/runbooks/pm-workflow.md#merging-the-board-and-the-worklog).

## The GitHub Manager

`morpheus-gh-manager[bot]` sweeps open PRs in opted-in repos — Morpheus included — and lands stalled
ones. **It is a backstop, not a plan:** never leave a PR for it to finish. Leave its labels and
`morpheus-manager-review` blocks alone; if it pushed to your branch, pull first; to leave a PR for
Chris, say so under `## Open questions`. Read [`gh-manager.md`](docs/runbooks/gh-manager.md) when it
applies.

## The inbox cycle

`hq/team/<handle>.md` is how a human and their agents exchange state, and the only files a human is
expected to edit. At the end of a session write a prose summary first, then `##` items — `✅`
closed with no reply slot, or `❗` open ending in `~` on its own line; a decision gets three
concrete options (recommended first) plus `Other`. Next session: act on replies, promote durable
ones to `decisions.md`, archive to `.agent/inbox-archive/`, write a fresh inbox. Run
`morpheus inbox validate`. **Read [`inbox-cycle.md`](docs/runbooks/inbox-cycle.md) before writing one.**

## Other rules

- **Google links:** always append `?authuser=<email>` (or `&authuser=`) — the address, not an index.
- **Websites:** when asked for a website, waitlist, signup or contact form or `/hq`, run
  `morpheus web init` before writing any of it by hand; for consumer accounts,
  `morpheus web add-consumer-auth`; after creating a Firebase project,
  `morpheus firebase auth setup`. Read [`website.md`](docs/runbooks/website.md) first.
- **Folder READMEs:** a folder gets one when an agent could plausibly do the wrong thing without
  it — short, pointing rather than repeating. See [`folder-readmes.md`](docs/runbooks/folder-readmes.md).

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
