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
  JSON.stringify({ name: s.name, prefix: s.prefix, kind: s.kind }, null, 2) + "\n";

export const agents = (s: Seed): string => `# ${s.name} — agent instructions

Read this before doing anything. \`CLAUDE.md\` is a symlink to this file so Claude and Codex
read the same instructions.

## Layout

| Path | What |
|---|---|
| \`hq/product/\` | Roadmap, goals and requests — the board agents pick work from |
| \`hq/inbox/<handle>.md\` | How a person and their agents exchange state |
| \`hq/brand/\` | Strategy, voice, visual system and tokens |
| \`hq/onboarding.md\` | Setup checklist — \`morpheus init status\` |
| \`.agent/decisions.md\` | Settled choices and why — **read this first** |
| \`.agent/learned.md\` | Things that have bitten us |
| \`.agent/worklog/\` | What was attempted per task, including dead ends |

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

export const ci = (): string => `name: CI

# Delegates to the Morpheus reusable workflows, so improving CI for every
# project is one commit there rather than a change in every repository.

on:
  push:
    branches: [main]
  pull_request:

jobs:
  node:
    uses: cpheinrich/morpheus/.github/workflows/node-ci.yml@main

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

# Editor-pasted images. Screenshots belong in chat, not in the repo — a
# 448 KB paste once reached a public repository this way.
*.png
*.jpg
*.jpeg
!hq/brand/assets/*.png
`;
