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
