---
roadmap: MO-26-11-07-22.16.48
tags: [engineering, devops]
---
# Scheduled task deployment observations

Added optional bounded deployment history to the existing scheduled-task document and canonical
v1 wire. Missing history stays absent. Five unique run IDs, positive safe run/attempt/job IDs,
closed state values, nullable lowercase full SHA and sixteen unique protocol-safe stage IDs
bound the projection. The existing owner-private file reader and reporter pass rows unchanged.
Both deployment timestamps use the sample source clock plus the existing sixty-second tolerance.

The design is a small schema extension and clock check, with no structural change or useful new
relationship diagram. Reused the installed Zod boundary and existing numeric/id/date validators;
no new generic module or dependency. Consumer server acceptance precedes producer activation.
Actual observation times survive successful rereads; invalid acquisition produces an error rather
than new deployment evidence. No runtime, credential, enrollment or deployment changes were made.

## Validation

- `node --test plugins/factory/src/host/reporting/tests/scheduled-tasks.test.mjs`: 6 passed.
- `node --test plugins/factory/src/host/reporting/tests/*.test.mjs`: 95 passed. Scope includes
  the changed protocol's adapters, actual file reader, snapshot isolation and transport/security.
- `pnpm typecheck`: passed.
- `pnpm compile`: passed; no generated runtime change expected for this optional mjs boundary.
- `pnpm morpheus pm index`: passed.
- `morpheus complexity check`: passed, enforce CCN 15/cognitive advisory 15, 21 changed
  functions checked in two measured files; generated dist excluded. Inspected task clock family
  and schema refinements; no finding. Tests cover max counts, malformed/unsafe values, duplicate
  IDs, absent compatibility, all states, exact clock boundary and one millisecond beyond it,
  producer-clock versus newer sample-clock, stale rereads, symlink/mode and file-size rejection.

## Discovery and limits

The exact worktree index was unavailable. Used the primary project's graph as provisional
navigation (generation 2026-11-08T03:42:53Z), checked protocol/source coverage, and read the exact
worktree files directly. Did not install or change host tooling. Initial oversized context reads
were not credited by the hook; after reading the records, explicitly took an assertion receipt
with `MORPHEUS_READ_EVIDENCE=off`. The claim reconciled the preceding scheduled-task item to
shipped in its claim commit. Dependency installs used the unchanged frozen lockfiles locally.

## Review handoff

Independent review has not run: the delegated task explicitly prohibits launching another agent
or delegating further. No self-review record or clearance is claimed. The supervising Codex must
launch an independent reviewer with the prepared packet and finish its record/CI before any
future merge. Keep this PR draft with auto-merge disabled; this task does not authorize merge or
activation. Consumer and producer semantic checks and user-visible rollout acceptance belong to
their owners, not this reusable protocol patch.

Canonical candidate: `plugins/factory/src/host/reporting/protocol.mjs`.
SHA-256: `217ff1d2b2420a165ac67337b07d1a8a55a08b5435a0f85f06fcd5371f596d83`.
