---
roadmap: MO-26-10-06-11.58.05
date: 2026-10-06
---
# Opt Morpheus into the GitHub Manager

Pre-approved rollout of the GitHub Manager to cpheinrich/morpheus, modelled on Evo
(darwin-health/evo), which has run it since 2026-10-05.

## What changed

- `.github/morpheus-gh-manager.json`: `version: 1` plus `protectedPaths`. Everything else takes
  the defaults.
- `.github/gh-manager-prompt.md`: the session overlay.
- `AGENTS.md` (and so `CLAUDE.md`, its symlink): one paragraph in the existing "The GitHub
  Manager" section pointing at the policy and overlay, rather than a second copy of Evo's
  backstop paragraph, whose content that section already carries.
- `tests/gh-manager.test.ts`: parses the repository's real policy, asserts each protected prefix
  exists on disk, and asserts the exact set of manager-engine paths it gates (plus three ordinary
  paths it must not). Checked by deleting `src/cli/check.ts` from the policy: the test failed.

## Settings and why

- **`protectedPaths`.** The engine already gates `AGENTS.md`, `CLAUDE.md`, `morpheus.json`,
  `.github/`, `.ci/`, `.morpheus/` (`NORMATIVE` in `src/review/local.ts`), so
  `.github/workflows/gh-manager.yml` and every reusable workflow are covered and not repeated.
  Not covered, and added:
  - `src/gh-manager`, `src/cli/gh-manager.ts`: the manager itself. It must not clear a change to
    the code that runs it.
  - `src/cli/check.ts`: `check pr` reads the App's clearance marker here (`parseMarker`).
  - `src/review`: the review contract's validators, including `manager.ts`, which validates the
    manager's own record and reads this policy.
  - `src/init/templates.ts`: copied into every new scaffold; AGENTS.md says to keep it aligned.
  - `docs/runbooks/gh-manager.md`, `docs/runbooks/independent-review.md`: the contract text.
  `dist/` is not listed: CI's `verify-build-clean` fails any PR whose `dist/` differs from
  `pnpm compile`, so a `dist/` change to these modules always arrives with its gated source.
  Prefixes match whole files or directories, so a `dist/cli/gh-manager.*` entry would need three
  exact files for no extra protection.
- **`sessionBeforeMerge`: default (false).** AGENTS.md tells authors to merge their own work once
  checks pass, and a blocked item must not open a PR at all. Unlike Evo, nothing here deliberately
  leaves finished work open, so enabling auto-merge from the sweep is right.
- Cooldowns, session cap, attempts, model, actions: defaults. No record here argues otherwise.

## Findings for the PR

- No tag-triggered workflow: no `on: push: tags` and no `release` event in `.github/workflows/`.
  `release-preflight.yml` is `workflow_call` only. Nothing to protect before adoption.
- Repository settings: `allow_auto_merge: true`, `delete_branch_on_merge: true`. Unchanged.

## Not done here

Installing the `morpheus-gh-manager` App on this repository and adding `cpheinrich/morpheus` to
`config/repositories.json` in the operations repository are the runbook's steps 1 and 3; they
happen outside this pull request.

## Notes

- `managerPolicy` in `src/review/manager.ts` reads the policy at the PR's head, so a PR could in
  principle drop a protected path from its own policy. It cannot benefit: the policy file is under
  `.github/`, which is normative, so that PR is gated anyway.
