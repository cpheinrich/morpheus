---
date: 2026-07-29
agent: claude
roadmap: MO-003
outcome: shipped
summary: MO-003 contradicted a settled decision; rewritten around git dependencies, which unblocks three items.
---

## The miss

I told Chris that MO-003 blocked MO-004/005/006. He asked why, given Evo and Darwin already consume
Morpheus fine and we had agreed not to publish.

Both halves of his question were right. The decision — *do not publish `morpheus-kit` to npm* — was
recorded 2026-07-29; MO-003 was written 2026-07-28 and says "publish the kit to GitHub Packages".
**A roadmap item and a decision contradicted each other for a day and nobody reconciled them.**

I read `.agent/decisions.md` at the start of sessions, as AGENTS.md instructs. I did not check the
roadmap against it. Reading the decisions is not the same as reconciling them with the plan.

## The conflation worth keeping straight

Three different things were sitting under one word:

- **CLI** — `npm link` locally, checked out and built in CI. No package needed.
- **Workflows** — `uses: cpheinrich/morpheus/...@main`, resolved by GitHub from the public repo.
- **Runtime imports** — React components, the `/hq` shell, token modules. These genuinely cannot be
  linked or checked out; a Vercel build needs them resolvable as a dependency.

Only the third needed anything, and a git dependency (`github:cpheinrich/morpheus#main`) covers it
without publishing. Public repo, so no token, no `.npmrc`, no release workflow.

## Consequence

Three items I had listed as blocked are not. They need the kit package to *exist*, which is
ordinary work, not a distribution pipeline waiting on credentials.
