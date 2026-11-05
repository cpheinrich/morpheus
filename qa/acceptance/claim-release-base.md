# pm claim --base: release-branch task bases

User mandate (Chris, relayed by the Codex root, 2026-11-05): *"cut R from main at staging
start, fixes ONLY merge R, then merge R back main after CD complete"*; *"implement minimum
explicit TASK-BASE support … default no option must remain current main"*; *"bad/missing/
unreadable refs cannot silently fall back to main"*; *"no direct push R"*.

Hermetic Git and fake `gh` fixtures only; no live release branch is created.

1. **Default unchanged.** `pm claim <ID>` without `--base`, context refresh/check and review
   default to the project trunk exactly as before.
2. **Base isolation.** With `main` at A, R = A + fix B, and `main` then advanced to an
   unrelated M: `pm claim <ID> --base R` prepares and claims a worktree that contains B and
   not M. `context refresh`, the gate, `pm resume` and `context brief` lag stay measured
   against R, so M is never required or suggested.
3. **R advances.** When R gains another fix, the task is asked to integrate R only.
4. **Review.** `review prepare`/`validate` default to the task base and a normal record
   validates with PR base R. An explicit `--base` still wins.
5. **Refusals.** An unprotected, unknown, malformed or unreadable base (or a failed `gh`
   read) refuses before any worktree, branch or push; nothing falls back to `main`. An item
   already on `main` but absent from R refuses with a remedy.
6. **Preserved.** Worktree preparation, session binding, untracked-intake move, claim branch
   naming and pushes are unchanged; the claim pushes only the task branch, never R.
7. typecheck, compile (dist), `pm index`, focused tests, one full suite; CI full.
