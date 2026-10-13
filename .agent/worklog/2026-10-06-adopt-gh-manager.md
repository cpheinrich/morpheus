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

## Independent review

One fresh reviewer session reviewed b8d8648 at normal risk. It found one substantive gap, cleared on condition: check pr's gate logic and the waiver policies were not protected. It also found one minor over-escalation in the overlay. Both are fixed in bcde023.

```morpheus-review
{
  "version": 2,
  "base": "3e376b4189548eb06fe9b171e86e426892a64036",
  "reviewed": "b8d8648c478f8e90d37e684feae1fb76a8c3d59b",
  "covered": "bcde0234fa312bcb3d68948aa0d2199599b97204",
  "authorSession": "27eae6da-fbd7-435d-a5ed-0ed0c3b55db2",
  "reviewerSession": "a4b2da88bd27bb74b",
  "risk": "normal",
  "elapsedMinutes": 1.5419,
  "timing": {
    "source": "runner",
    "durationMs": 92514,
    "evidence": "Task notification for reviewer agent a4b2da88bd27bb74b: duration_ms=92514."
  },
  "outcome": "complete",
  "summary": "One fresh reviewer session reviewed b8d8648 at normal risk. It found one substantive gap, cleared on condition: check pr's gate logic and the waiver policies were not protected. It also found one minor over-escalation in the overlay. Both are fixed in bcde023.",
  "findings": [
    {
      "id": "S01",
      "severity": "substantive",
      "description": "protectedPaths omitted the gate logic check pr applies (src/check/pr.ts, src/paths.ts, src/dependabot/policy.ts, src/security/policy.ts), so the manager could clear a change to the rules every caller of pr-check.yml is judged by, and AGENTS.md claimed check pr was covered.",
      "paths": [".github/morpheus-gh-manager.json", "tests/gh-manager.test.ts", "AGENTS.md", ".github/gh-manager-prompt.md"],
      "disposition": "fixed",
      "response": "Added src/check, src/paths.ts, src/dependabot/policy.ts and src/security/policy.ts to protectedPaths, one positive path from each to the test's engine list, and named them in AGENTS.md and the overlay.",
      "condition": {
        "paths": [".github/morpheus-gh-manager.json", "tests/gh-manager.test.ts", "AGENTS.md", ".github/gh-manager-prompt.md"],
        "evidence": "pnpm typecheck && npx vitest run tests/gh-manager.test.ts, then full CI."
      },
      "conditionMet": "Commit bcde023 changed only the conditioned paths; pnpm typecheck passed and tests/gh-manager.test.ts passed 50/50; full CI runs on the PR."
    },
    {
      "id": "M01",
      "severity": "minor",
      "description": "The overlay told the session to escalate engine and reusable-workflow PRs even when engine step 5 (a complete author review covering head, landed by a clean trunk merge) would land them.",
      "paths": [".github/gh-manager-prompt.md"],
      "disposition": "fixed",
      "response": "Both escalation paragraphs now say step 5 still applies; escalation is for PRs that would rest on the manager's own review."
    }
  ]
}
```
