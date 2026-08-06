/**
 * What a Morpheus project starts as.
 *
 * Every template here is written from what the Evo and Darwin retrofits
 * actually needed, which is why this was deliberately built second. Guessing
 * the shape before doing it twice by hand would have produced a scaffold that
 * looked right and was wrong in ways nobody could name.
 *
 * Nothing emits a `TODO`. A file full of placeholders looks answered and is
 * not, which is worse than an absent file — the same rule the brand package
 * follows.
 */

export interface Seed {
  name: string;
  prefix: string;
  kind: "company" | "personal" | "internal";
  /** GitHub handle of the owner, for the inbox filename. */
  owner: string;
}

export const manifest = (s: Seed): string =>
  JSON.stringify(
    {
      name: s.name,
      prefix: s.prefix,
      kind: s.kind,
      // The handle puts `hq/team/<handle>.md` into the session-freshness
      // required set. It is the record a human actually replies in, so an
      // agent resuming without re-reading it is the failure the protocol
      // exists for — and the policy cannot derive a handle on its own.
      context: { handle: s.owner },
    },
    null,
    2,
  ) + "\n";

/**
 * The public Morpheus repository.
 *
 * Every scaffolded project links back here, because a project's conventions are
 * only legible to someone who has read Morpheus — and the readers who most need
 * that are the ones who cannot be told: code review agents, which start with no
 * memory by design, and agents working for collaborators.
 */
export const MORPHEUS_REPO = "https://github.com/cpheinrich/morpheus";

/**
 * The callout every project carries, in two registers.
 *
 * Kept as constants rather than inlined so the wording is one fact. Five repos
 * carry this text; five copies that drift are five different answers to "what
 * is this repo".
 */
export const morpheusCalloutForAgents = (): string =>
  `## This project is managed by Morpheus — read that first

This repository is architected and operated according to
[Morpheus](${MORPHEUS_REPO}), which is public. The directory layout,
the roadmap and inbox formats, the \`morpheus\` CLI, and the conventions below all come from
there. Very little of the *reasoning* behind them lives in this repo.

**Before reviewing or changing anything here, read:**

- [\`architecture.md\`](${MORPHEUS_REPO}/blob/main/architecture.md)
  — the specification: what the structure is, and why it is that way
- [\`AGENTS.md\`](${MORPHEUS_REPO}/blob/main/AGENTS.md)
  — the operating principles: claiming work, what a pull request must carry, the inbox cycle

This is aimed at agents arriving with **no memory of this project**. Without that context the
conventions here look arbitrary, and the resulting mistakes are confident ones: "tidying" a
generated file that is rewritten from its source, renaming an id that a branch and a PR both
depend on, deleting a worklog as clutter, or branching by hand instead of \`morpheus pm claim\`
and colliding with another agent's work.

### Found a gap in Morpheus itself?

If something in Morpheus is wrong, missing, or gets in your way while working here, **send it
upstream**. Do not quietly work around it in this repo — a local workaround fixes one project,
hides the defect from every other one, and leaves the next agent to rediscover it.

1. **Open an issue.** ${MORPHEUS_REPO}/issues
   It is the durable record, it needs no fork, and it is where triage happens.
2. **A pull request is welcome too**, especially carrying a fix you have verified — you hit the
   problem, so you can prove the fix works, and that reproduction is the expensive part to
   rebuild from a description.
3. **Create the roadmap item in your pull request**, with \`morpheus pm new roadmap "..."\`.
   Do not leave it for a maintainer: a roadmap id is a timestamp and \`baseSha\` is the commit
   **you** were on, so both only mean anything when recorded at the moment you hit the problem.
   Written afterwards by someone else, they record the wrong repository and a date days late.

A pull request from outside the project needs a fork; an issue does not. Note that a fork's CI
runs without secrets, so some checks skip and a first-time contributor's workflows need manual
approval — that is GitHub's behaviour, not a problem with your change.`;

export const morpheusCalloutForReadme = (): string =>
  `## Built and managed with Morpheus

This project is architected and operated with
[Morpheus](${MORPHEUS_REPO}) — a public framework for structuring
and running a company's repositories so that agents can do the work.

That is why this repo has \`hq/\` for the business layer, \`.agent/\` for what agents have learned,
and roadmap items with prefixed ids. Those are Morpheus conventions, not local invention.

**If you are reviewing or contributing here — human or agent — read Morpheus first:**

- [Architecture](${MORPHEUS_REPO}/blob/main/architecture.md)
- [Operating principles](${MORPHEUS_REPO}/blob/main/AGENTS.md)

Most conventions in this repo have a reason recorded there rather than here, so without it they
read as arbitrary and get "corrected" into breakage.

Found a shortcoming in Morpheus while working here? **Open an issue** rather than working around
it locally — that is how Morpheus gets better. A pull request is welcome too, especially with a
fix you have verified; include the roadmap item in it, since a roadmap id is a timestamp and only
means anything recorded at the moment you hit the problem.

${MORPHEUS_REPO}/issues`;

/**
 * A README for humans.
 *
 * Deliberately short. `init` cannot know what the project *is*, and a template
 * that guesses produces prose nobody trusts — so it states only what is true of
 * every Morpheus project and leaves the description as one visible line to
 * fill in. The same rule as the rest of this file: no `TODO` that looks
 * answered.
 */
export const readme = (s: Seed): string => `# ${s.name}

_One sentence on what this is._

${morpheusCalloutForReadme()}

## Working here

\`\`\`sh
morpheus init status    # how far through setup this repo is
morpheus pm claims      # what work is already taken
morpheus pm claim ${s.prefix}-001   # stake a branch and start
\`\`\`

Agent instructions are in [\`AGENTS.md\`](./AGENTS.md); \`CLAUDE.md\` symlinks to it.
`;


/**
 * A README for a directory that earns one.
 *
 * Not every folder does. The rule (see `AGENTS.md`) is that a folder gets one
 * when an agent could plausibly do the wrong thing without it: it feeds
 * something else, it has a convention filenames do not reveal, it is generated,
 * or it is a seam between projects. Framework-standard directories — `app/`,
 * `components/`, `__tests__/` — do not, because their meaning is universal and
 * a README restating it is noise that can also go stale.
 *
 * These are **short on purpose** and point at `architecture.md` for the
 * canonical explanation rather than repeating it. Locality is what a README
 * buys — eight lines where you are standing beat 1,400 lines in another repo —
 * but two copies of the same reasoning drift, so depth stays in one place.
 *
 * The previous scaffold wrote `Nothing here yet.` into every directory, which
 * looks documented and says nothing. A file full of placeholders is worse than
 * an absent one, the same rule the brand package follows.
 */
const SPEC = "https://github.com/cpheinrich/morpheus/blob/main/architecture.md";

export const dirReadmes: Record<string, (s: Seed) => string> = {
  "hq/team": () => `# Team

Who collaborates on this project, and what passed between them.

\`hq/\` is otherwise organised by business **function** — product, brand, marketing, finance. This
folder is a **medium**: one meeting covers three functions, so it belongs to none of them.

| Path | What |
|---|---|
| \`members.md\` | The roster — handles, names, and how to work with each person |
| \`<handle>.md\` | That person's live inbox — the human↔agent exchange |
| \`meeting-notes/\` | Distilled meeting summaries, never transcripts |

## Inboxes

One file per person, named for their GitHub handle — \`cpheinrich.md\`, not \`chris.md\`.

**These are the only files a human is expected to edit.** An agent writes a summary and numbered
items at the end of a session; the human replies inline after the \`~\` marker, and the next
session acts on the replies and archives the exchange to \`.agent/inbox-archive/\`.

An inbox is a snapshot, never a log. \`morpheus inbox validate\` enforces the shape and CI runs it.

## Everything here is raw input to a distillation

Meeting notes feed \`.agent/decisions.md\` and the roadmap; they are not meant to be read in bulk.
A note whose decisions were never promoted is an archive, and an agent that reads every archive
knows less, not more.

\`morpheus team validate\` checks the roster and every note.

See [the inbox cycle](${SPEC}) in the specification.
`,

  "hq/marketing": (s) => `# Marketing

SEO, content plans, and campaign notes for ${s.name}.

Positioning and voice live in \`hq/brand/\` and are **read** from here, not restated — a second
copy of the messaging is one that drifts from the brand package that generates it.
`,

  "hq/finance": (s) => `# Finance

Revenue and expense model, pricing, and runway for ${s.name}.

Numbers that a dashboard reads belong in structured files rather than prose, so \`/hq/finance\`
can render them without parsing sentences.
`,

  "hq/ops": (s) => `# Ops

Legal, contracts, vendors, and suppliers for ${s.name}.

Contracts themselves are not committed — this holds the index and the decisions, not the PDFs.
Large binaries do not belong in a text repository.
`,

  "qa": () => `# QA

Acceptance criteria, test plans, and known defects.

\`qa/acceptance/<name>.md\` is the input to verifier rung 3: a roadmap item's \`acceptance\` field
names a file here, and the check is whether the shipped work meets it. An item with no
\`acceptance\` has nothing to verify against, which is the gap this directory exists to close.

Unit and integration tests live beside the code they test, not here.

See the verifier stack in [the specification](${SPEC}).
`,

  "qa/acceptance": () => `# Acceptance criteria

One file per roadmap item, named by that item's \`acceptance\` field.

Written **before** the work, in terms a reviewer can check without reading the implementation:
what a user can now do, what the system must refuse, what must not have changed. If it can only be
verified by reading the diff, it is a test, not an acceptance criterion.
`,

  "infra": () => `# Infra

Deployment configuration, security rules, and environment definitions.

\`firestore.rules\` is partly **generated** — the role helpers between the \`morpheus:begin roles\`
markers come from the role vocabulary and are rewritten by \`morpheus hq rules\`. The \`match\`
blocks around them are yours. Never hand-edit inside the markers.

Provisioning is not here: consoles, DNS and hosting need credentials this repo should not hold.

See [access control](${SPEC}) in the specification.
`,
};

export const agents = (s: Seed): string => `# ${s.name} — agent instructions

Read this before doing anything. \`CLAUDE.md\` is a symlink to this file so Claude and Codex
read the same instructions.

${morpheusCalloutForAgents()}

## Layout

| Path | What |
|---|---|
| \`hq/product/\` | Roadmap, goals and requests — the board agents pick work from |
| \`hq/team/<handle>.md\` | How a person and their agents exchange state |
| \`hq/brand/\` | Strategy, voice, visual system and tokens |
| \`hq/onboarding.md\` | Setup checklist — \`morpheus init status\` |
| \`.agent/decisions.md\` | Settled choices and why — **read this first** |
| \`.agent/learned.md\` | Things that have bitten us |
| \`.agent/worklog/\` | What was attempted per task, including dead ends |

${contextFreshness()}
## Working conventions

**Claim work before starting it:**

\`\`\`sh
morpheus pm claims             # what is already taken
morpheus pm claim ${s.prefix}-001      # stakes the branch on origin, sets in-progress
\`\`\`

The remote branch **is** the claim. Never create the branch by hand — \`pm claim\` derives it from
the item id, so the two cannot disagree.

**Every PR must carry** tests for anything testable, a documentation update when behaviour
changes, a test plan, any open questions stated plainly rather than guessed at, and the roadmap
item moved to \`review\`.

**Before opening a PR**, run \`morpheus pm index\` and commit any index changes. CI runs the same
check and will fail otherwise.

**Append a worklog entry** to \`.agent/worklog/YYYY-MM-DD-slug.md\`. Record dead ends especially —
git history cannot hold work that produced no code, and that is the expensive knowledge.

## Branch protection

\`main\` is protected. **Never push to \`main\`** — work on a branch, open a PR, and merge it
yourself once checks pass.

\`\`\`sh
gh pr merge <n> --squash --auto --delete-branch
\`\`\`

## Style

- Small, single-purpose modules with named exports
- Explicit types at boundaries; inference inside
- Errors surfaced as data rather than thrown, so one bad input cannot abort a batch
- Comments that explain *why*, not *what*
`;

export const decisions = (s: Seed): string => `# Decisions

Settled choices and the reasoning behind them. **Read this at the start of every session.**

If a decision here looks wrong, say so and ask — do not quietly work around it. A decision worked
around rather than revisited is one that gets made again, differently, next month.

Each entry: what was decided, when, and the reason. The reason is the part that matters; the
decision alone cannot be re-evaluated when circumstances change.

## ${new Date().toISOString().slice(0, 10)} — ${s.name} follows the Morpheus structure

\`hq/\` for the business, \`.agent/\` for what agents learn, ids prefixed \`${s.prefix}-\`.

**Why:** conventions shared across projects mean an agent that has worked on one can work on any of
them, and improvements to CI or tooling land once rather than per repository.
`;

export const learned = (): string => `# Learned

Things that have bitten us. Not decisions — those live in \`decisions.md\` — but the surprises
worth not rediscovering.

Add an entry when something cost you more than ten minutes and the cause was not obvious.
`;

export const agentReadme = (): string => `# .agent

Four records, each answering a different question.

| File | Question it answers |
|---|---|
| \`decisions.md\` | What did we settle, and why? |
| \`learned.md\` | What has bitten us before? |
| \`worklog/\` | What happened during this task, including what failed? |
| \`inbox-archive/\` | What was asked and answered, and when? |

The split matters because they have different lifetimes. A decision stays true until reversed. A
worklog entry is a snapshot and is never edited. An inbox is a live document; its archive is the
record.
`;

export const worklogReadme = (): string => `# Worklog

One file per task: \`YYYY-MM-DD-slug.md\`, with frontmatter naming the roadmap item and outcome.

\`\`\`md
---
date: 2026-07-29
agent: claude
roadmap: XX-001
outcome: shipped | abandoned | blocked | research
summary: One line.
---
\`\`\`

**Record dead ends.** Git history holds what worked; only this holds the two hours spent proving
an approach could not work, which is exactly what the next person needs.
`;

export const inboxArchiveReadme = (): string => `# Inbox archive

Past inbox cycles with their replies, filed \`YYYY-MM-DD-HHMM-<handle>.md\` — date first, so the
directory reads as one timeline.

An inbox is a snapshot and never accumulates history. This is the record.
`;

/**
 * Deliberately short, and deliberately a pointer.
 *
 * The canonical version — frontmatter fields, both redaction passes, the
 * public-repo rule — is 130 lines in Morpheus's own `hq/team/meeting-notes/`.
 * Copying it into every project would give one copy per repo to drift, and the
 * one that drifts is a document about what may be published. What locality
 * buys is the *gate* being visible where somebody is standing; the depth stays
 * in one place.
 */
export const meetingNotesReadme = (): string => `# Meeting notes

**A summary, never a transcript.** One file per meeting, named
\`PREFIX-YY-MM-DD-HH.MM.SS-short-handle.md\`, where the timestamp is when the meeting *started* — in
the wall clock of the people who were in it, with the offset in \`occurred\`.

A transcript is high volume and low signal; storing them would make an agent's context worse rather
than better. What is worth keeping is what was decided, what someone has to do, and enough of the
reasoning that a decision can be argued with later.

**\`redacted: true\` is a claim you are making**, and \`morpheus team validate\` refuses a note without
it. It means you have stripped everything not about this project, and checked that the note is
something you would be relaxed about being read back — by the team, by the person it is about, or
by a stranger in a year.

The canonical format, the frontmatter fields, and both redaction passes are documented once, in
[Morpheus](https://github.com/cpheinrich/morpheus/blob/main/hq/team/meeting-notes/README.md).
Depth stays in one place so two copies cannot drift.

A note is **raw input**: its decisions belong in \`.agent/decisions.md\` and its action items on the
roadmap. A note whose outputs were never promoted is an archive, which is much less useful than it
looks.
`;

export const inbox = (s: Seed): string => `---
owner: ${s.owner}
date: ${new Date().toISOString().slice(0, 10)}
agents: [human]
---

Nothing yet. An agent writes here at the end of a working session: a prose summary of what got
done, then numbered items you reply to inline.

## \u2705 1. How this file works \u00b7 \`human\`

Each item is **either** closed or open, never both and never neither. The state lives in the
heading, because \u2757 and \u2705 carry colour and scanning should not depend on the renderer.

An open item ends in a \`~\` on its own line. Type your answer after it, leaving the marker in
place. On its next turn the agent reads your replies, acts on them, promotes anything durable to
\`.agent/decisions.md\`, archives the exchange to \`.agent/inbox-archive/\`, and writes a fresh
inbox.

An inbox is a snapshot and never accumulates history. \`morpheus inbox validate\` enforces the
shape, and CI runs it too.
`;

/**
 * CI for the project, matched to what the project actually is.
 *
 * `node-ci` runs `pnpm install --frozen-lockfile`, so wiring it into a static
 * site or a Python repo fails on the first push. A scaffold whose CI is red on
 * day one teaches people to ignore red CI, which costs more than the workflow
 * was worth.
 *
 * The convention checks are toolchain-agnostic — they build the Morpheus CLI
 * from a checkout — so every project gets those.
 */
export const ci = (opts: { node: boolean } = { node: true }): string => `name: CI

# Delegates to the Morpheus reusable workflows, so improving CI for every
# project is one commit there rather than a change in every repository.

on:
  push:
    branches: [main]
  pull_request:

jobs:${
  opts.node
    ? `
  node:
    uses: cpheinrich/morpheus/.github/workflows/node-ci.yml@main
`
    : ""
}
  pm:
    uses: cpheinrich/morpheus/.github/workflows/pm-check.yml@main

  pr:
    uses: cpheinrich/morpheus/.github/workflows/pr-check.yml@main
`;

export const productReadme = (
  kind: "roadmap" | "goals" | "requests",
  s: Seed,
): string => {
  const blurb = {
    roadmap: `Work, one file per item. Ids are \`${s.prefix}-001\` upward.\n\nCreate with \`morpheus pm new roadmap "Title"\`. The table below is generated — edit the item files, not this.`,
    goals: `What the work is for. A roadmap with no goal is a list nobody can decline.\n\nCreate with \`morpheus pm new goals "Title"\`.`,
    requests: `Incoming asks, before they become roadmap items. Triage, then accept or decline —\ndeclining explicitly is the point.`,
  }[kind];

  return `# ${kind[0]!.toUpperCase()}${kind.slice(1)}

${blurb}

<!-- morpheus:begin -->
<!-- morpheus:end -->
`;
};

export const hqReadme = (s: Seed): string => `# ${s.name} HQ

Everything about running ${s.name} that is not code.

| Directory | What |
|---|---|
| [\`product/\`](./product) | Roadmap, goals and incoming requests |
| [\`inbox/\`](./inbox) | One file per person — how humans and agents exchange state |
| [\`brand/\`](./brand) | Strategy, voice, visual system, tokens |
| [\`onboarding.md\`](./onboarding.md) | Setup checklist — \`morpheus init status\` |

Markdown with YAML frontmatter is the source of truth. Index tables are generated between the
\`morpheus:\` markers and are never edited by hand.
`;

export const gitignore = (): string => `
# Morpheus
local/
.env
.env.local

# Editor-pasted images, which land at the repo root or in the folder that
# happens to be open. A 448 KB screenshot reached a public repository that way.
#
# Scoped to the root rather than \`*.png\` on purpose: a brand session produces
# moodboards, mockups and logo exports, and a scaffold that quietly ignores the
# design work is worse than one that occasionally lets a screenshot through.
/*.png
/*.jpg
/*.jpeg
local/**/*.png
`;

/**
 * Claude Code's session hooks.
 *
 * One hook, and it is deliberately **informational rather than blocking**.
 * `context brief` prints what the session is missing and always exits 0; the
 * refusal lives in the `morpheus` CLI, which is provider-neutral and needs no
 * per-project wiring. A blocking `PreToolUse` hook would fire on every edit,
 * and a gate that fires constantly is a gate people disable — permanently,
 * where the staleness was temporary.
 *
 * Codex reads `AGENTS.md`, not this file, which is why the instruction is in
 * both places and the enforcement is in neither.
 */
export const claudeSettings = (): string =>
  JSON.stringify(
    {
      hooks: {
        SessionStart: [
          {
            hooks: [
              {
                type: "command",
                // Bare, not `pnpm morpheus`. `init` writes no `package.json`,
                // so a scaffolded project has nothing for pnpm to resolve —
                // and AGENTS.md documents `npm link` putting `morpheus` on
                // PATH. Wrapping it also puts a layer in front that fails for
                // its own reasons, which is what `context brief` exiting 0 by
                // design was meant to avoid.
                command: "morpheus context brief",
              },
            ],
          },
        ],
      },
    },
    null,
    2,
  ) + "\n";

/**
 * The freshness section every project's AGENTS.md carries.
 *
 * Short, and pointing rather than repeating — the reasoning is one copy, in
 * `architecture.md` §7.10. What has to be local is the two commands and the
 * list of what is refused, because an agent that has to follow a link to find
 * out it is about to be refused will not follow it.
 */
export const contextFreshness = (): string =>
  `## Context freshness

**Read \`.agent/decisions.md\`, \`.agent/learned.md\` and your inbox, then:**

\`\`\`sh
morpheus context refresh
\`\`\`

This takes a *context receipt* — your assertion that you have loaded current project state,
fingerprinted against the tip of the trunk — \`origin/main\` unless \`context.trunk\` says
otherwise, see the fork note below. It is good for five minutes, after which the next governed
command re-checks the trunk and those records.

**Until you have one, these are refused:** \`pm claim\`, \`pm new\`, \`pm block\`, \`access sync\`.
Read-only and mechanical commands are not gated.

\`\`\`sh
morpheus context status    # what the current lease says, and how old it is
morpheus context check     # exit non-zero unless fresh — for hooks and scripts
morpheus context brief     # the session-start message; always exits 0
\`\`\`

\`context brief\` is what \`.claude/settings.json\` runs at the start of a session — the only
Morpheus command this project runs automatically.

**When something has moved**, \`context refresh\` prints what landed on the trunk and which
records changed. Re-read those, then refresh again — the delta is the point, not the ceremony.

**Offline**, set \`MORPHEUS_OFFLINE=1\` — or pass \`--offline\`. Local work proceeds; anything that leaves the machine —
pushing a claim, granting access — is still refused, because an unverified trunk is exactly
when you should not be operating external controls. **\`pm block\` still works**: it writes the
records and skips the push, telling you the block is not visible to other sessions yet. Blocking
rather than guessing is the one escape hatch a stuck session needs most.

**On a fork**, set \`"context": { "trunk": "upstream/main" }\` in \`morpheus.json\`. \`origin\` is
your fork, whose \`main\` sits still while the real trunk moves — measured against it, a lease
certifies fresh forever.

Receipts live in \`local/sessions/\`, which is gitignored. A receipt says *this working copy read
these files*, which is true of one machine — committing it would turn a local observation into a
claim about everyone. Shared evidence stays the worklog, the commit and the PR.

Why this exists, and the failure modes it is built against:
[\`architecture.md\` §7.10](${MORPHEUS_REPO}/blob/main/architecture.md).
`;
