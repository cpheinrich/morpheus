---
date: 2026-08-22
agent: codex
roadmap: MO-26-08-22-01.03.02
outcome: review
summary: Added an idempotent trusted-device bootstrap and exact-checkout proof for codebase-memory.
---

# Install and configure codebase-memory on Morpheus devices

## What changed

`morpheus codebase-memory install` now inspects before writing, installs the reviewed
`codebase-memory-mcp@0.10.8` pin through its official npm wrapper when the native binary is absent
or reports another version,
delegates client-file merging to the upstream installer, enables automatic indexing and watching,
fully indexes the exact checkout, and verifies a ready graph at the current Git HEAD. `--check` is
read-only, `doctor` reports the same drift, and every newly scaffolded README and AGENTS file carries
the device check. The check also proves that the linked Morpheus source contains current
`origin/main` when the remote is reachable; it reports a behind clone instead of rewriting active
work.

The architecture and decision record preserve two separate freshness claims: operational freshness
is an exact-checkout runtime proof; upstream package freshness is a reviewed pin update, never an
implicit `latest` download.

## Live repair and dead ends

The device already had version 0.10.8 and current automatic-maintenance settings, but the upstream
installer reported ambiguous ownership for both Codex and Claude configuration. The Codex file
contained an older installer-marked hook block, so it was backed up, the marked block alone was
removed, the installer recreated it, and the existing trusted hashes were restored and enabled.
The Claude hook was intentionally customized in an earlier session to neutralize a coercive
reminder; overwriting it would have reversed a deliberate local policy, so functional readiness
accepts the configured client without demanding that the upstream installer own that file.

The globally linked Morpheus CLI was behind current source and initially generated a retired
roadmap table while creating this item. Running the current source CLI removed the stale output;
the static README link was restored before claiming. This is why the new check includes the linked
Morpheus source, not only the dependency it installs.

## Verification

- Pinned npm-wrapper smoke test returned codebase-memory-mcp 0.10.8.
- A full live index of the isolated worktree completed with 3,203 nodes and 7,036 edges; its only
  parse-partial ranges were pre-existing and outside this change.
- All 960 tests passed after rebasing onto current main. Focused cases cover absent install, mismatched installed version,
  idempotent readiness, stale graph SHA, stale Morpheus source, non-destructive installer ownership
  warnings, and generated project instructions.
- Production compilation, TypeScript typechecking, PM indexing and validation, team validation, and
  `git diff --check` passed. The repository's `pnpm lint` script could not run because ESLint is not
  declared or installed; that pre-existing tooling drift produced no lint result.
