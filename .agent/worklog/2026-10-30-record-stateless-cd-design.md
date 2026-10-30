---
id: MO-26-10-30-16.04.16
title: "Record the stateless CD design and Chris's 2026-10-30 delivery decisions"
date: 2026-10-30
tags: [engineering, devops, infrastructure]
---

# Stateless iOS delivery: design, decisions and stages

## Outcome

architecture.md §18.2 now specifies stateless iOS delivery (CD V3) in place of the CD V2 block.
`.agent/decisions.md` records Chris's 2026-10-30 decisions and the lead's call to replace V2
rather than slim it. The Morpheus deletion stage is filed as MO-26-10-30-16.06.29. This is records
and design only. No CD code, workflow, host or ledger is changed here.

## What was measured (2026-10-30)

- **Failures.** 17 failed `cd-v2-delivery` runs since 2026-10-20:
  - 7 preflight "deployed rules differ from client source";
  - 6 tests;
  - 2 upload races (since fixed);
  - 1 qualify;
  - 1 phone gate (old source).

  Separately, staging stalled for four days. A failed attempt parked the channel in `repairing`.
  The repair needed a human-approved continuation that never came, and the repair worker refused
  to start whenever the quota reader timed out.
- **Pins.** Evo's CD workflows pinned six different Morpheus commits. The open #702 added a
  seventh, with 726- and 210-file import manifests. Every `cd.json` change altered a digest the
  ledger enforces.
- **Ledger.** The state file was 4.8 MB, with 7,666 transitions and 671 commits in 24 hours, and
  it still polled uploads retired days earlier.
- **Size.** `ops/macos/evo-cd-v2` is 95 files and 20,500 lines (7,000 of them runtime manifests).
  44 of those files (8,200 lines) are campaign, fault, drill, proof, admission, post-resume and
  migration code.

## Why replace rather than slim

Classifying every V2 check against "does it protect users?" left almost nothing for a controller
to own. The table is in architecture.md. The checks that protect users are tests and test
integrity, the phone gate, rules compatibility, signing and artifact verification, and internal
availability. All of them already live in the jobs that produce them.

Everything else served the ledger: digests and migrations, reservations, fences and leases, pinned
runtimes, the campaign, and the repair queue's quota gates. Slimming V2 meant four refactor stages
inside `src/cd`. Replacing it means one Evo workflow and two deletions. Evo's legacy release lanes
are the proof that the stateless shape delivers. The lead accepted the replacement, and on
2026-10-30 Chris moved implementation forward ("go ahead and do the simplifications now").

## Stages and their state at filing

- **A, Morpheus fresh-simulator retries.** MO-26-10-30-15.16.58, assigned to another agent.
- **B, Evo steward and watchdog.** EV-26-10-30-15.20.47, assigned to another agent. B measures
  both V2 and V3 runs.
- **S1, suites and quarantine.** Started by another agent as EV-26-10-30-15.28.38.
- **S2, Morpheus `@main` everywhere outside CD.** EV-26-10-30-15.29.26, merged as
  darwin-health/evo#704.
- **Rules, the `firebase-deploy.yml` delivery contract.** Redirected to the rules agent.
- **S3, the V3 workflow.** EV-26-10-30-15.25.08, darwin-health/evo#707. Reviewed and cleared, and
  waiting only on the rules contract; Chris's Xcode 27.2 pin (#705) has merged.
- **S4 (cutover) and S5 (delete V2 from Evo).** EV-26-10-30-16.14.48 and EV-26-10-30-16.14.52,
  filed in darwin-health/evo#710.
- **M1.** Filed here.

The in-flight `src/cd` agent (unparking, quota, zero source age) was stopped, because V2
unparking is moot under V3. Evo #702 will not merge; S4 closes it.

## Dead ends

- **Seeding a fresh minimal `state.json`.** Rejected because receipt tags carry everything later
  runs need (the staging change cursor), and they need no CAS.
- **Keeping the Pro tick as a scheduler only.** Rejected: GitHub cron plus the watchdog already
  covers a dropped slot.
- **Reading the Xcode version from `cd.json`.** Rejected: Chris owns that pin. Changing V2's
  `cd.json` would also have changed V2's enforced digest.

## Test plan

- Records only: architecture.md, decisions.md, the roadmap items, this worklog and the docs banner.
- Ran `pnpm typecheck`, `pnpm compile` (no `dist/` change), `pnpm morpheus pm index` and
  `pnpm morpheus pm validate`.
- No source change, so no focused tests apply.

## Independent review

Independent normal-risk review of 162686d5 confirmed the owner decisions are recorded faithfully and the code claims hold (App Store Connect next build number with a host floor, ios-ci's exact artifact-helper rule, the helper kept). It cleared on condition F1 (substantive): the quarantine row described an automatic list that would silently make tests non-blocking; it now describes the reviewed, expiring quarantine S1 builds. Minor fixes: M1 now moves the quota reader the Paperclip pilot still loads and fixes the compile script (F2); M1 gating is consistent with the soak (F3); the supersedes list keeps readiness waits and artifact snapshots standing and names the missing V2 decisions (F4); the upload action's resolution time (F5), release-preflight's current-head requirement and pending-run replacement (F6), stopping in-flight V2 runs before archiving (F7) and the schedule's location (F8) are stated accurately, with S4's item carrying the fixes. The trunk merge that followed was hand-resolved in decisions.md, keeping both new entries.

```morpheus-review
{
  "version": 2,
  "base": "c31b8830179592548fdaa94b9fad2e118baa6f8c",
  "reviewed": "162686d50881e8d27f068a6fdd7f9bdaa90af6de",
  "covered": "bd63528c79c821533582b7134b7b41e053131db5",
  "authorSession": "2e8c6704-50d3-4322-a8a0-085bfea03671",
  "reviewerSession": "aec35742bf0d206e6",
  "risk": "normal",
  "elapsedMinutes": 10.046783333333334,
  "timing": {
    "source": "runner",
    "durationMs": 602807,
    "evidence": "Claude Agent tool result duration_ms=602807 for reviewer aec35742bf0d206e6 initial turn; reviewer clock 23:19:51Z-~23:29:30Z."
  },
  "outcome": "complete",
  "summary": "Independent normal-risk review of 162686d5 confirmed the owner decisions are recorded faithfully and the code claims hold (App Store Connect next build number with a host floor, ios-ci's exact artifact-helper rule, the helper kept). It cleared on condition F1 (substantive): the quarantine row described an automatic list that would silently make tests non-blocking; it now describes the reviewed, expiring quarantine S1 builds. Minor fixes: M1 now moves the quota reader the Paperclip pilot still loads and fixes the compile script (F2); M1 gating is consistent with the soak (F3); the supersedes list keeps readiness waits and artifact snapshots standing and names the missing V2 decisions (F4); the upload action's resolution time (F5), release-preflight's current-head requirement and pending-run replacement (F6), stopping in-flight V2 runs before archiving (F7) and the schedule's location (F8) are stated accurately, with S4's item carrying the fixes. The trunk merge that followed was hand-resolved in decisions.md, keeping both new entries.",
  "findings": [
    {
      "id": "S0-F1",
      "severity": "substantive",
      "disposition": "fixed",
      "paths": [
        "architecture.md"
      ],
      "description": "The 'failed then passed on retry' row said tests are auto-quarantined and warn until removed, contradicting the owner's 'tests block', the design's 'nothing else is stored', and S1's reviewed, expiring quarantine; agents aligning code to it would silently make tests non-blocking.",
      "response": "bd63528c replaces the row with the reviewer's wording: a reviewed quarantine entry (one test, linked issue, expiry at most 14 days), warning until expiry, then blocking again.",
      "condition": {
        "paths": [
          "architecture.md",
          ".agent/worklog/2026-10-30-record-stateless-cd-design.md"
        ],
        "evidence": "grep -n auto-quarantin architecture.md returns nothing; pnpm morpheus pm validate passes."
      },
      "conditionMet": "bd63528c: grep -n auto-quarantin architecture.md returned nothing; pnpm morpheus pm validate: all project management files are valid."
    },
    {
      "id": "S0-F2",
      "severity": "minor",
      "disposition": "fixed",
      "paths": [
        "hq/product/roadmap/MO-26-10-30-16.06.29-delete-cd-v2.md"
      ],
      "description": "M1 missed non-CD users of src/cd: the Paperclip pilot's nativeQuota loads dist/cd/quota-reader.js, and the compile script copies src/cd/*.py.",
      "response": "M1 now requires moving the quota reader or retiring the pilot's dependency first (naming quota.mjs, supervisor.py, inventory.example.json, the pilot design doc) and updating the compile script."
    },
    {
      "id": "S0-F3",
      "severity": "minor",
      "disposition": "fixed",
      "paths": [
        "architecture.md",
        "hq/product/roadmap/MO-26-10-30-16.06.29-delete-cd-v2.md"
      ],
      "description": "M1's gating was inconsistent between the stage table, the acceptance paragraph and the item.",
      "response": "All three now say after S4 and its soak (two consecutive V3 deliveries per channel), parallel with S5."
    },
    {
      "id": "S0-F4",
      "severity": "minor",
      "disposition": "fixed",
      "paths": [
        ".agent/decisions.md"
      ],
      "description": "The supersedes list over-reached (readiness waits, artifact admission snapshots) and omitted several V2 decisions (host templates, hosted repair quota, provider routes, cancelled SourceCI, empty external testers).",
      "response": "The list is now 'including', names the omitted decisions, and states that internal readiness, artifact admission snapshots and external-after-internal stand."
    },
    {
      "id": "S0-F5",
      "severity": "minor",
      "disposition": "fixed",
      "paths": [
        "architecture.md"
      ],
      "description": "The design implied the recorded Morpheus SHA is all the Morpheus code a run uses, but @main workflows resolve at run creation and the upload action at its job start.",
      "response": "architecture.md states the limit and that S4 runs the upload action from a checkout at the plan SHA; Evo's S4 item (darwin-health/evo#710) carries that step."
    },
    {
      "id": "S0-F6",
      "severity": "minor",
      "disposition": "fixed",
      "paths": [
        "architecture.md"
      ],
      "description": "release-preflight also requires the current head of main, and 'a concurrency group that never cancels' ignores GitHub replacing a pending run.",
      "response": "Both are described accurately; the current-head requirement is classified process-only and S4 replaces it with a reviewed-merge-reachable-from-main check (also in the S4 item)."
    },
    {
      "id": "S0-F7",
      "severity": "minor",
      "disposition": "fixed",
      "paths": [
        "architecture.md"
      ],
      "description": "Migration step 1 named only the tick and worker; dispatched V2 delivery and repair runs also write the ledger and can upload.",
      "response": "Step 1 now disables the cd-v2 workflows and waits for or cancels in-flight V2 runs before tagging; the S4 item says the same."
    },
    {
      "id": "S0-F8",
      "severity": "minor",
      "disposition": "fixed",
      "paths": [
        "architecture.md"
      ],
      "description": "cd.json was said to hold the schedule, but the cron is literal in the workflow and S4 drops it from cd.json.",
      "response": "The sentence lists channels, identities, watched inputs and native settings, and says the cron lives in the workflow."
    },
    {
      "id": "S0-I1",
      "severity": "incidental",
      "disposition": "fixed",
      "paths": [
        ".agent/decisions.md",
        "hq/product/roadmap/MO-26-10-30-16.06.29-delete-cd-v2.md"
      ],
      "description": "The branch conflicted with main in .agent/decisions.md; M1 said the artifact helper runs for every CD execution id rather than every ios-ci run.",
      "response": "Trunk merged in 7b09018b keeping both new decisions entries (named in trunkIntegrations); M1's wording now says every ios-ci run."
    }
  ],
  "trunkIntegrations": [
    {
      "commit": "7b09018bb698df1ef50d744119b799243d7b16c0",
      "reason": "Hand-resolved .agent/decisions.md: main's new 'Simplicity first' entry and this PR's entry both append to the end; kept both, main's first. No other hunk needed resolution."
    }
  ]
}
```
