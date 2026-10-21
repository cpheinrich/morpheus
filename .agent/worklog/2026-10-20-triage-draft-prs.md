---
date: 2026-10-20
roadmap: MO-26-10-20-17.24.49
agent: claude
---

# GitHub Manager triages quiet draft and WIP pull requests

## Why

During a CTO backlog audit of Evo, the manager's latest run (10-20 16:29Z) skipped 16 of 26 open
pull requests as "draft, WIP branch or WIP title; awaiting a human to mark it ready". Some had sat
for more than a month. That skip was Chris's deliberate choice on 10-12 (#378, decisions.md), so it
was a policy gap, not a bug. Chris then asked for triage instead: some drafts are basically good to
go, some are well specified and incomplete, and some are not useful and should be ignored until
resumed. Issue #442.

## What was done

- `sweep.ts`: after the rescued-trunk check, `routeWorkInProgress` does three things in order:
  - keeps `hold` for queued auto-merge and the plain skip for `wip/trunk-*` drafts and for
    `actions.triage: false`;
  - skips a draft already triaged at this head (`escalated`, `incomplete`, `dormant`,
    `triaged-ready`);
  - waits out `draftQuietHours`, then routes a `session` with reason `triage`.
  Attempts are counted per head, and a spent budget is a skip, not an escalation. `sessionOrder`
  ranks `isWorkInProgress`, so a WIP title ranks after ready work as a draft does. A triage verdict
  (`ready` or `dormant`) does not count against the ordinary path's attempts once the pull request
  is ready.
- `decision.ts`: the `ready` and `dormant` actions, a `remainingChecks` field, and `planTriage`.
  - `ready` marks only a plain draft ready, under `actions.undraft`; a WIP title or branch is only
    reported.
  - `incomplete` adds `manager:incomplete` with a handoff; `dormant` adds the new
    `manager:dormant`.
  - A Git-verified push escalates, and an unverifiable push applies nothing.
  - Merge and close are refused, and an ordinary session cannot return triage verdicts.
- `prompt.ts`: a separate read-only `triagePrompt`, which the CLI selects for the triage reason.
- `cli/gh-manager.ts`: the apply step's triage path verifies pushes against the sweep head, never
  publishes evidence, and keeps the no-session and no-decision handling.
- Documentation: the runbook gains a "Triaging drafts and WIP pull requests" section and policy
  key; the author note's stale "8 hours" is corrected to the configured values. Architecture §7.13
  is updated, and a decisions.md entry supersedes only the plain-skip part of 10-12.

## Dead ends and choices

- I considered letting `ready` go straight to the ordinary merge in the same run. Rejected: draft
  state must not authorize a merge. Marking it ready hands it to the unchanged sweep, which applies
  the review, CI, quiet and `sessionBeforeMerge` rules on its own next run.
- I considered closing redundant drafts through the existing `close` path. Rejected: Chris said
  ignore them until someone resumes, so `dormant` closes nothing.
- I considered escalating when triage attempts run out on a head. Rejected: nobody asked the
  manager anything, and a `needs-human` label on an untouched draft is noise. It is a skip until
  a push.
- No workflow change was needed: the existing `session` matrix, the read token and the apply
  checkout cover triage. The session token can still push technically, so the read-only rule is
  enforced after the fact by `sessionPushed` in apply.

## Testing

- `pnpm exec vitest run tests/gh-manager.test.ts tests/gh-manager-evidence.test.ts tests/gh-manager-preview.test.ts tests/agent-instructions.test.ts`:
  132 passed, 85 of them in `gh-manager.test.ts`. I chose these because the change is confined to
  the manager, its CLI and the runbook that `agent-instructions` checks for links.
- Hand mutations, each killed by the suite: the push guard, the plain-draft check, the quiet
  boundary, the same-head dormant skip, the WIP ranking (killed after adding the WIP-title sweep
  test), the attempt reset, and triage auto-merging.
- `pnpm typecheck` and `pnpm compile` (with `dist/`) pass; `pm validate` and `pm index` are clean.
  I did not run the full suite locally (no shared core touched); CI `node / check` passed on the PR.
- Not exercised against a live repository. It takes effect after the ops repository bumps its
  pinned Morpheus SHA.

## Follow-ups

- #444: the manager's own review record failed its validator on an Evo pull request (10-20 04:35Z)
  because the visible summary paragraph was not verbatim. Give the session the apply check before
  it decides.
- Escalations that sit forever behind `manager:needs-human` (Evo had 5) are visible only as labels.
  Delivering them to the person, or re-judging author holds against a repository's pre-release
  latitude, is unscoped.

## Independent review

One fresh reviewer reviewed 6e6ced4 at high risk and found triage unable to merge, close or change a branch, with no pull request text in its brief. It raised one substantive finding, F1: triage and ordinary-session attempts shared a counter, so a draft promoted by a person could escalate with no ordinary session having run, and an ordinary path's attempts could block triage. It cleared F1 on condition that triage markers carry a flag that keeps the two budgets apart, with focused tests and regenerated dist. It also raised three minors: F2, leftover labels from an earlier head suppressed re-triage; F3, digest and skip-list wording; F4, the read-only claim was advisory and a session that pushed and reported its old head ended in a silent wait. Commit bac93b7 satisfies the F1 condition and fixes F2 to F4: skips now need the label and this head's verdict to agree, apply reads branch changes from Git before trusting the reported head, also with no decision, and the docs say instructed read-only. 135 focused tests, typecheck and compile pass, and hand mutations of each new guard fail the suite. Minting a read-only token for triage sessions, which needs a workflow change, is left as an open question for Chris.

```morpheus-review
{
  "version": 2,
  "base": "78f905dbc22875eb8d56cd5a439d032e18e243e0",
  "reviewed": "6e6ced40088ecc52bb28becb800a9e7006b07c42",
  "covered": "bac93b7bd20c58afa24019911f62a374e886760a",
  "authorSession": "fd586d7f-b1be-42dc-9e74-c085264f46b0",
  "reviewerSession": "claude-code-subagent/a7730633e928f043e",
  "risk": "high",
  "elapsedMinutes": 6.497016666666667,
  "timing": {
    "source": "runner",
    "durationMs": 389821,
    "evidence": "Claude Code Agent task notification for reviewer subagent a7730633e928f043e: usage duration_ms=389821, 22 tool uses, single initial turn."
  },
  "outcome": "complete",
  "summary": "One fresh reviewer reviewed 6e6ced4 at high risk and found triage unable to merge, close or change a branch, with no pull request text in its brief. It raised one substantive finding, F1: triage and ordinary-session attempts shared a counter, so a draft promoted by a person could escalate with no ordinary session having run, and an ordinary path's attempts could block triage. It cleared F1 on condition that triage markers carry a flag that keeps the two budgets apart, with focused tests and regenerated dist. It also raised three minors: F2, leftover labels from an earlier head suppressed re-triage; F3, digest and skip-list wording; F4, the read-only claim was advisory and a session that pushed and reported its old head ended in a silent wait. Commit bac93b7 satisfies the F1 condition and fixes F2 to F4: skips now need the label and this head's verdict to agree, apply reads branch changes from Git before trusting the reported head, also with no decision, and the docs say instructed read-only. 135 focused tests, typecheck and compile pass, and hand mutations of each new guard fail the suite. Minting a read-only token for triage sessions, which needs a workflow change, is left as an open question for Chris.",
  "findings": [
    {
      "id": "F1-split-budgets",
      "severity": "substantive",
      "description": "Triage markers were indistinguishable from ordinary-session markers. A draft triaged twice (wait) and then undrafted by a person routed straight to escalate attempts-spent with no ordinary session run; a finished handoff started the ordinary path at attempts=1; and an ordinary path's two attempts made a re-drafted pull request untriageable, with a false 'reached no classification' detail.",
      "paths": [
        "src/gh-manager/sweep.ts",
        "src/gh-manager/decision.ts",
        "src/cli/gh-manager.ts"
      ],
      "disposition": "fixed",
      "response": "ManagerMarker gains an optional triage flag, validated and round-tripped by parseMarker. Every marker planTriage and the new planTriageNoDecision write sets it (hold, wait, escalate, ready, incomplete, dormant, no-decision). The ordinary path ignores triage markers for attempts, and routeWorkInProgress counts only same-head triage markers. The sweep.ts comment and runbook now describe separate budgets. Tests cover scenarios A, B and E, the flag round-trip, and that every triage marker carries it.",
      "condition": {
        "paths": [
          "src/gh-manager/sweep.ts",
          "src/gh-manager/decision.ts",
          "src/cli/gh-manager.ts",
          "tests/gh-manager.test.ts",
          "docs/runbooks/gh-manager.md",
          "dist/gh-manager/sweep.js",
          "dist/gh-manager/sweep.js.map",
          "dist/gh-manager/sweep.d.ts",
          "dist/gh-manager/decision.js",
          "dist/gh-manager/decision.js.map",
          "dist/gh-manager/decision.d.ts",
          "dist/cli/gh-manager.js",
          "dist/cli/gh-manager.js.map",
          "dist/cli/gh-manager.d.ts"
        ],
        "evidence": "pnpm typecheck; pnpm exec vitest run tests/gh-manager.test.ts tests/gh-manager-evidence.test.ts tests/gh-manager-preview.test.ts tests/agent-instructions.test.ts; confirm dist/ matches pnpm compile."
      },
      "conditionMet": "Commit bac93b7 implements the flag in sweep.ts, decision.ts and cli/gh-manager.ts. The reviewer suggested a planNoDecision option for the no-decision path; it is a dedicated planTriageNoDecision in decision.ts instead, which also escalates a changed branch. Tests are in tests/gh-manager.test.ts, the runbook is updated, and dist/ was regenerated by pnpm compile. pnpm typecheck passed; the four focused files passed 135/135; pnpm compile left no further diff. Hand mutations removing the flag check in either budget or the flag on triage markers each fail the suite."
    },
    {
      "id": "F2-stale-labels",
      "severity": "minor",
      "description": "routeWorkInProgress honoured manager:incomplete, manager:dormant and manager:needs-human whenever the marker head matched, whatever the marker's verdict. A label left from an earlier head therefore suppressed re-triage after a triage wait or escalate at the new head.",
      "paths": [
        "src/gh-manager/sweep.ts",
        "tests/gh-manager.test.ts",
        "dist/gh-manager/sweep.js",
        "dist/gh-manager/sweep.js.map"
      ],
      "disposition": "fixed",
      "response": "Each skip now requires the label and this head's marker verdict to agree (escalate, incomplete, dormant). Scenarios C and D and a dormant-versus-incomplete case are tested, and a mutation restoring the head-only check fails."
    },
    {
      "id": "F3-attempt-wording",
      "severity": "minor",
      "description": "The triage-attempts-spent detail said sessions 'reached no classification' when they may have classified, and the runbook skip list omitted triage-attempts-spent and described triaged-ready as WIP-title only.",
      "paths": [
        "src/gh-manager/sweep.ts",
        "docs/runbooks/gh-manager.md",
        "dist/gh-manager/sweep.js",
        "dist/gh-manager/sweep.js.map"
      ],
      "disposition": "fixed",
      "response": "The detail now reads 'N triage session(s) already spent on this head'. The runbook skip row names triage-attempts-spent and triaged-ready (a WIP branch or title, or disabled undraft), and the attempts bullet says every triage session counts."
    },
    {
      "id": "F4-readonly-claim",
      "severity": "minor",
      "description": "Docs called triage read-only though the session token can write. A session that pushed and reported its starting head ended in a silent branch-moved wait, so the claim that a human is asked to look was false in that case.",
      "paths": [
        "src/gh-manager/decision.ts",
        "src/cli/gh-manager.ts",
        "tests/gh-manager.test.ts",
        "docs/runbooks/gh-manager.md",
        "architecture.md",
        ".agent/decisions.md",
        "dist/gh-manager/decision.js",
        "dist/gh-manager/decision.js.map",
        "dist/gh-manager/decision.d.ts",
        "dist/cli/gh-manager.js",
        "dist/cli/gh-manager.js.map"
      ],
      "disposition": "fixed",
      "response": "planTriage checks whether the branch changed (from Git, sweep head to live head) before trusting the reported head or the WIP state, and escalates any change. planTriageApply reads that whether or not a decision was written, and planTriageNoDecision escalates too. The runbook, architecture and decisions now say the session is instructed to be read-only and checked afterwards for this branch only. Minting a contents-read token without persisted credentials for triage needs a workflow change; it is left as an open question in the PR."
    }
  ]
}
```
