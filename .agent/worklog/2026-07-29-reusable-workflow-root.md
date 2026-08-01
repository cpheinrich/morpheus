---
date: 2026-07-29
agent: claude
roadmap: MO-26-07-29-035
outcome: shipped
summary: pm-check and pr-check read pnpm's version from the consumer's root; they only ever worked in Morpheus.
---

## The failure

All three retrofit PRs failed identically: *No pnpm version is specified.*

`pnpm/action-setup` reads `packageManager` from the repository root. In a reusable workflow the
root is the **consuming** repo, and Morpheus is checked out into `.morpheus/`. Two of the three
retrofits have no root `package.json` at all.

## Why it survived this long

**A reusable workflow tested only in the repository that defines it is not tested.** Morpheus's own
root has `packageManager`, so `pm-check` passed at home. Evo passed too, being a pnpm workspace. It
took a static site and a Python repo — the first genuinely different consumers — to expose it.

Worth generalising: every default in a reusable workflow that resolves against "the repository" is
a place where the defining repo and a consumer disagree, and the defining repo is the one where
nobody notices.

## Related

MO-018 was this same fault mirrored: setting a version *and* having `packageManager` made
action-setup fail with "Multiple versions of pnpm specified". Both come from the workflow guessing
which manifest it means. `package_json_file` stops it guessing.

## Note

I merged #24 believing pr-check was fixed for non-Node consumers. It was — the `pnpm install` was
gone — but the *setup* step still resolved against the consumer. Removing one dependency on the
consumer's toolchain left another in the step above it.
