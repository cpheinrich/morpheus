---
date: 2026-07-29
agent: claude
roadmap: MO-032
outcome: shipped
summary: Convention checks no longer require the consuming repo to be a pnpm project.
---

## Found by looking before acting

`morpheus init` never overwrites, so running it on the three remaining projects was safe — and I
nearly did. Checking each repo first showed that two have no root `package.json` and the third is
npm plus Python.

`pr-check.yml` ran `pnpm install --frozen-lockfile` in the consuming repo. It would have failed on
the first push in two of three retrofits, and the scaffold would have looked like it worked.

## The rule

**A reusable workflow that installs in the consumer's repo inherits the consumer's toolchain as a
requirement**, whether or not it needs one. `pm-check` avoided this by checking Morpheus out into
`.morpheus/` and building there; `pr-check` copied the structure of `node-ci`, which legitimately
needs pnpm because it is *for* Node projects.

Nothing about "does this PR have a test plan" depends on the language.

## Also

`init` now scaffolds the Node CI job only when a pnpm lockfile exists, and says why when it skips
it. This is the second version of the same lesson from MO-008 — a scaffold that fails its own CI on
day one is worse than no scaffold, and there I only checked the files the tool wrote, not the
workflow it wired.
