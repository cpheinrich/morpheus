---
roadmap: MO-26-09-26-21.04.19
---
# Portable credentials companions

Lifted the Lakina pilot into shared Morpheus commands and offline scaffolding. Default to one
ignored clone per consuming project, while supporting shared remotes and optional shared physical
checkouts. Metadata is tracked; values remain in the private companion. Setup never replaces
PATH launchers. Sync is explicit, default-branch-only and fast-forward-only. Old origins migrate
only with declared aliases and matching GitHub IDs. No credentials or provider actions used in tests.

Validation: TypeScript check, full Vitest suite, compile and PM index; focused fixtures cover
relative/worktree paths, symlinks, ignore/tracked guards, overrides, private/denied clone behavior,
explicit empty-store provisioning, identity-checked renames, sync, child arguments and injection.
Native Node/Git/Bash orchestration avoids changing legacy shell semantics; dotenv was considered.

Graph MCP was unavailable. The installed graph checker reported no exact-checkout index; the
idempotent repair refused activation because active CBM sessions could not be stopped safely.
Used targeted source reads of CLI dispatch, scaffolding, templates and companion wrappers instead.
Existing unrelated roadmap edits in the primary checkout were preserved. Review pending.
