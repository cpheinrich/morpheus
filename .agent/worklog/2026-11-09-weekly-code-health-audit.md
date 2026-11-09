---
agent: codex
date: 2026-11-09
roadmap: MO-26-11-09-07.07.48
outcome: review
tags: [engineering, devops, security]
---

# Weekly code-health audit

## Mandate

- Outcome: deliver the current Morpheus codebase-wide technical-health review and coherent safe
  cleanup, with dependency remediation isolated for review.
- Acceptance: one dated marked main audit PR with ranked evidence/confidence/impact/action, the
  exact-main CI defect fixed, current focused security drafts linked, proportional validation,
  and fresh independent review; every PR stays open with auto-merge disabled.
- Authority: change this audit branch and refresh or create the exact remediation drafts; do not
  merge, enable auto-merge, close PRs, dispatch workflows, deploy, create credentials, or bypass
  governance.
- Budget: existing local subscription and included CI only; no new spend.
- Stop: acceptance or a precise blocker after safe alternatives are exhausted.

## Evidence and decisions

Audited exact `origin/main` `db1c3f76c367d0f39739126e20aeda0d2b5dea42` across root and
Factory production dependency graphs, graph/source dead-code candidates, tracked artifacts,
duplication, structural complexity, tests/CI, and live governance.

- Root audit: 3 high / 3 moderate production findings. Factory audit: 4 high / 10 moderate / 2
  low. Refreshed #576, #579, and #570 through current main; opened a missing root MCP SDK draft.
- #576 now clears every high Factory finding. Two moderate transitives remain via
  `firebase-admin` (`glob` and `minimatch`); the current direct parent does not expose a safe
  patched resolution, so no override was invented on the audit branch.
- Exact-main CI run `42603475253` fails the quota test whose fixed seven-day reset expired on
  2026-11-09. The relative-reset correction is the only source change here.
- `jscpd@5.4.2`: 410 files, 30 clones, 336 duplicated lines (0.38%).
- Complexity enforcement: 640 measured files, zero CCN violation, 108 cognitive advisories. No
  extraction was attempted across unproven state-machine boundaries.
- Production Knip and graph zero-degree results were treated as candidates. Direct source checks
  disproved the sampled unused-dependency/function candidates; no deletion met the evidence bar.
- Exact tree: 2,752 files, no tracked junk artifact, one documented and referenced media asset.
- Graph: exact-main full generation, 17,376 nodes / 65,171 edges, no skipped files, 13 partial
  parses; relevant flagged ranges were checked directly and negative claims remain bounded.
- Live main protection requires four checks, disallows force pushes/deletion, and keeps
  `deleteBranchOnMerge` enabled.

## Validation

- `pnpm --dir plugins/factory test --ignore-workspace` passes 176/176, including the corrected
  reset boundary.
- `pnpm typecheck`, `pnpm compile`, `pnpm morpheus pm index`,
  `pnpm morpheus pm validate`, `pnpm morpheus team validate`,
  `pnpm morpheus inbox validate`, and `git diff --check` pass.
- Fresh independent-review evidence is appended before PR creation.

## Remediation links

- #576: https://github.com/cpheinrich/morpheus/pull/576
- #579: https://github.com/cpheinrich/morpheus/pull/579
- #570: https://github.com/cpheinrich/morpheus/pull/570
- #664: https://github.com/cpheinrich/morpheus/pull/664
