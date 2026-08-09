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
