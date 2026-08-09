---
date: 2026-08-09
roadmap: MO-26-08-09-00.05.06
---

# Ship prebuilt git dependency artifacts

Reproduced issue #82 in a new pnpm 11.9.0 project against main at `5c7bdb2`. Installing
`github:cpheinrich/morpheus#5c7bdb2` failed with `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED` and proposed
an `allowBuilds` key containing the full resolved codeload SHA. No project-level package-name key
can make a moving git ref stable under that contract.

The registry-free distribution decision stands. Instead, the kit now commits its deterministic
TypeScript output and has no manifest field that asks npm or pnpm to rebuild a git dependency.
The contributor command is `pnpm compile`; Morpheus's workflows use it explicitly, and its own CI
rejects a compile that changes the committed tree.

The package-contract test encodes npm's complete current git-build trigger set rather than checking
only `prepare`. That matters because keeping a script literally named `build` would avoid pnpm's
reported hook while still making npm clone dev dependencies and rebuild on every git install.

## Verification

- Before the change, a fresh pnpm 11.9.0 consumer failed against main at `5c7bdb2` with the exact
  `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED` report from issue #82.
- After pushing `f205dac`, a fresh pnpm 11.9.0 consumer installed the branch in 3.6 seconds with no
  `allowBuilds` configuration. `morpheus-kit/design` imported and the installed `morpheus` CLI ran.
- A fresh npm consumer installed the same git ref with `--foreground-scripts`; no Morpheus lifecycle
  script ran. The design export imported and the installed CLI ran.
- `npm pack --dry-run --ignore-scripts` listed 264 package entries, including executable
  `dist/cli/index.js`, with a 979 KB unpacked package.
- A clean `pnpm compile && git diff --exit-code` produced no diff, exercising the same artifact
  drift condition CI now enforces.

Independent review found the first drift command only detected modified tracked files: it missed a
new untracked artifact and a stale output left behind after source deletion. CI now removes the
declared tracked output directory before compiling, stages the complete result, and compares the
index. Tests assert that mechanism, not just the caller inputs.

The same review caught a version seam in reusable workflows: a workflow body from `@main` may check
out an older pinned `morpheus-ref` that has `build` rather than `compile`. Those workflows now only
install the selected ref. Old refs generate `dist/` through their existing `prepare`; new refs
already carry it. The package test also derives all exports and bins from `package.json` and checks
the CLI executable mode, rather than hardcoding three entry points.

The second review raised the old-ref compatibility path as unverified. A clean checkout of
pre-artifact commit `5c7bdb2` began without `dist/`; `pnpm install --frozen-lockfile` ran that ref's
existing `prepare`/`build` hook, produced an executable CLI, and `node dist/cli/index.js --help`
succeeded. This confirms a current reusable workflow can install both sides of the transition.

The review also caught that `git rm --ignore-unmatch` would silently weaken staleness detection for
a mistyped or newly empty output directory. The clean step now requires the declared path to match
tracked files before removing it. Verification stages and compares only that declared output path,
so unrelated files produced elsewhere by a consumer job do not fail a build-output check.

The final review found one non-blocking public-API rough edge: enabling verification without an
output directory reached Git's opaque empty-pathspec failure. The workflow now names that missing
required input directly, documents that verification is scoped to it, and rejects glob characters
along with absolute and parent-traversing paths.
