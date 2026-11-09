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
- Exact tree: 2,751 files, no tracked junk artifact, one documented and referenced media asset.
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

## Independent review

Fresh normal-risk independent review conditionally cleared 5e33b36c with one substantive factual finding and no other findings. AUD-COUNT-1 found that the report, worklog, and PR body stated 2,752 exact-main files while the exact tree contains 2,751. The reviewer pre-cleared a correction limited to the report and worklog plus the matching PR-body line. Commit dd42752b makes that correction; the exact count returns 2,751 and git diff --check passes. The reviewer verified the fixture semantics, focused test, dependency and graph counts, remediation states, duplication and complexity results, CI/governance evidence, and coverage caveats. No retained diagram would help. The full suite was not rerun; the review relied on exact-head CI, the author's 176/176 Factory run, and targeted analyzer/test evidence.

```morpheus-review
{
  "version": 2,
  "base": "db1c3f76c367d0f39739126e20aeda0d2b5dea42",
  "reviewed": "5e33b36ca8df89be3058f034b0e6850055703167",
  "covered": "dd42752ba09fef2db1bd4d27cf9c1bc239f84dc2",
  "authorSession": "01a1c0d5-069c-7052-afc9-cb4c0d5f45c6",
  "reviewerSession": "/root/morpheus_audit_665_review",
  "risk": "normal",
  "elapsedMinutes": 10.3607,
  "timing": {
    "source": "runner",
    "durationMs": 621642,
    "evidence": "Codex subagent task_complete for turn 01a1c10b-ce8e-75b3-a137-e7fdba7e41ac reported duration_ms=621642."
  },
  "outcome": "complete",
  "summary": "Fresh normal-risk independent review conditionally cleared 5e33b36c with one substantive factual finding and no other findings. AUD-COUNT-1 found that the report, worklog, and PR body stated 2,752 exact-main files while the exact tree contains 2,751. The reviewer pre-cleared a correction limited to the report and worklog plus the matching PR-body line. Commit dd42752b makes that correction; the exact count returns 2,751 and git diff --check passes. The reviewer verified the fixture semantics, focused test, dependency and graph counts, remediation states, duplication and complexity results, CI/governance evidence, and coverage caveats. No retained diagram would help. The full suite was not rerun; the review relied on exact-head CI, the author's 176/176 Factory run, and targeted analyzer/test evidence.",
  "findings": [
    {
      "id": "AUD-COUNT-1",
      "severity": "substantive",
      "description": "The report, worklog, and PR body said exact main contained 2,752 tracked files, but git ls-tree at db1c3f76 reports 2,751; the wrong baseline would corrupt future comparisons.",
      "paths": [
        "qa/audits/2026-11-09-technical-health.md",
        ".agent/worklog/2026-11-09-weekly-code-health-audit.md"
      ],
      "disposition": "fixed",
      "response": "Commit dd42752b corrects both durable records to 2,751 and the live PR body carries the same count.",
      "condition": {
        "paths": [
          "qa/audits/2026-11-09-technical-health.md",
          ".agent/worklog/2026-11-09-weekly-code-health-audit.md"
        ],
        "evidence": "Replace the exact-main count with 2,751, align the PR body, rerun git ls-tree -r --name-only db1c3f76c367d0f39739126e20aeda0d2b5dea42 | wc -l, and run git diff --check."
      },
      "conditionMet": "Commit dd42752b changes only the reviewer-allowed report and worklog paths; the PR body was aligned to 2,751. The exact git ls-tree command returned 2,751 and git diff --check passed."
    }
  ]
}
```
