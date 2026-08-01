---
id: MO-26-07-28-003
title: "Consume the kit as a git dependency, not a published package"
status: shipped
priority: P0
goal: MO-G-2026-Q3-01
owner: agent
prs: [26]
created: 2026-07-28
updated: 2026-07-29
---

> Migrated from `MO-003` to `MO-26-07-28-003` (MO-057). References to `MO-003` in git
> history, commit messages and merged pull requests still resolve — the old number is
> the last field of the new id.

## Dropped as written

The original item was *"publish the kit to GitHub Packages — release workflow on tag, `.npmrc`
scoping, and the PAT setup that cross-org consumption requires."*

It contradicts a decision settled the following day:

> **Do not publish `morpheus-kit` to npm** — 2026-07-29. Publishing only helps strangers install
> it, which is the opposite of the goal.

The item was written 2026-07-28 and never reconciled. Chris caught it.

## What Evo and Darwin actually use today, and why it scales

Two things, neither of which needs a package:

| What | How it reaches a project |
|---|---|
| The `morpheus` **CLI** | `pnpm build && npm link` locally; CI checks the repo out and builds it |
| The reusable **workflows** | `uses: cpheinrich/morpheus/.github/workflows/node-ci.yml@main` |

GitHub resolves the workflow reference straight from the public repo, and MO-032 made both
convention checks build the CLI from a checkout rather than installing it. **That arrangement has
no ceiling** — a hundred projects would consume it the same way.

## The one thing that genuinely cannot work this way

Runtime code an app *imports*: React components, the `/hq` dashboard shell, generated token
modules.

```ts
import { Button } from "morpheus-kit/design";
```

`npm link` does not survive a Vercel build, and a workflow reference cannot be imported at
runtime. That is the whole of what MO-003 was reaching for, and none of it exists yet.

## The answer: a git dependency

```json
"dependencies": {
  "morpheus-kit": "github:cpheinrich/morpheus#main"
}
```

pnpm and npm both support this natively. The repo is public, so it needs no token, no `.npmrc`, no
release workflow, and no PAT — and nothing is published, so the decision stands intact.

The cost is that a git dependency pins to a ref rather than a semver range, so `morpheus upgrade`
becomes "move the ref" instead of "bump the version". Given there are four projects and one author,
that is simpler, not harder.

## Consequence

**MO-004, MO-005 and MO-006 are not blocked on a publishing pipeline.** They are blocked on the kit
package existing at all, which is a much smaller step — a `packages/kit` directory with subpath
exports, consumed by ref.
