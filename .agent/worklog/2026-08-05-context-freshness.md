---
roadmap: MO-26-08-05-12.24.47
date: 2026-08-05
summary: Established a provider-neutral, CI-tested receipt and session-lease policy before wiring any real agent runner.
---

## First checkpoint

Added the pure context receipt/lease model, an explicit fail-closed guard, and
a mock `SessionAdapter`. The policy treats an unavailable remote as `unknown`,
not as unchanged; a changed SHA or canonical input produces the smallest known
refresh set. Tests cover fresh, stale, unknown, and mock notification paths
without contacting GitHub, Codex, or Claude.

## Claude review gate

The local Claude CLI is authenticated, but its non-interactive invocation
returned no review payload despite multiple bounded read-only attempts. Do not
claim Claude feedback was incorporated. A readable Claude review remains a
required gate before merge; Chris elected to open the draft PR now so Claude
can review the visible branch. The deterministic foundation advances
independently because its acceptance tests do not rely on provider availability.

## Verification before draft review

`pnpm test` passed 596 tests and `pnpm typecheck` passed. `pnpm lint` could
not run because the package script invokes `eslint`, but eslint is not
installed or declared by the repository; this is reported in the PR rather
than presented as a passing check.

## Second checkpoint — what the review found

Claude's rung-2 review landed three findings, all inside what the branch
claimed rather than what it deferred. They shared one shape: **a field was
written and never read, so the code named a guarantee it did not provide.**

- `checkedAt` was stored and never compared. A "five-minute lease" with no
  term is a receipt, and `readLease` is exactly the path that brings a
  six-hour-old one back. Now `leaseAt` expires it, and `requireFresh` defaults
  `now` to the real clock so a caller cannot skip the check by omitting the
  argument. An unparseable or future `checkedAt` expires too — a clock that
  moved backwards must not buy a lease extra life.
- `ContextInput.fingerprint` was stored and never compared; drift came
  entirely from a caller-supplied optional `changedInputs`. A receipt with
  `inputs: []` therefore certified as `fresh` — the `.agent/learned.md` failure
  verbatim, where the check skips what is absent and reports the empty thing as
  correct. Receipts are now measured against a declared `CANONICAL_INPUTS` set,
  and observations carry fingerprints rather than conclusions.
- `readLease` cast unvalidated JSON. `null` read as "no session ever existed",
  and `{}` reached `requireFresh` and threw a `TypeError` instead of failing
  closed. Now zod-validated, returning `{ lease, issue }` so corrupt and absent
  are distinguishable, and `writeLease` renames into place so a crash cannot
  produce the half-file in the first place.

**The thing no reviewer flagged:** merging this branch would have reconciled
MO-26-08-05-12.24.47 to `shipped`, with four of five acceptance criteria
unbuilt — and CLAUDE.md is explicit that a shipped item is never looked at
again. The item is now scoped to the policy it actually contains, and
MO-26-08-05-16.27.56 carries the enforcement, offline exception, and adapters.
Worth generalising: **when a claimed item is knowingly delivered in slices, the
split has to happen before the first merge, not after.** The board has no other
way to learn that the rest exists.

## Third checkpoint — the doc outran the code

Round 3 reviewed the architecture section rather than the code, and found the
inverse of round 2's problem: **§7.10 asserted guarantees the module made
optional.** Worth naming as a shape, because CLAUDE.md says architecture.md is
the specification and more current than the code — so a doc that overstates is
not a wording slip, it is a spec the next implementer will build against.

- "Drift is derived, not asserted" was true only if the caller passed
  `inputs`, which was optional. The doc's own justification is the argument:
  *a caller that can choose what counts as changed can also choose to report
  nothing*, and omission is that choice under another name. Now required.
- The coverage rule could be switched off with `requiredInputs: []` — round
  one's finding restored through config. `[]` stays meaningful, because a
  project genuinely may have no canonical records, but `undefined` now
  explicitly means "none declared, take the default", and
  MO-26-08-05-16.27.56 carries an acceptance criterion that a blank or
  unparseable policy file must never resolve to `[]`.
- `remoteSha` had no definition, and it is the field the whole verdict turns
  on. Settled: the tip of `origin/main`, not the branch tip.

Two carryovers from round 2, both fixed: `notifyAdapter` gated on
`refresh_required`, so the offline lease this branch went out of its way to
populate with a known delta was the one case the runner never heard about; and
`readInputs` rethrew every non-ENOENT fs error inside a `Promise.all`, so one
unreadable record aborted the check with a raw fs error instead of reading as
drift. `CLAUDE.md` is a symlink here, which is the realistic path to it.

`readInputs` was added for the same reason the fingerprint finding existed —
nothing in the branch produced a fingerprint, so both sides of the comparison
were theoretical. One producer for receipt and observation makes them
comparable by construction rather than by convention. 611 tests pass.
