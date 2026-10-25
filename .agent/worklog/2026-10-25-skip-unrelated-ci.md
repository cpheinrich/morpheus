# Skip unrelated CI — MO-26-10-24-23.13.37

Chris requested a separate CI optimization PR after the Paperclip overview merge:
skip irrelevant expensive checks, retain PM/PR conventions, and explain/reduce
the duplicate Python artifact ABI legs without losing useful coverage.

## Implementation and choices

- Add a native Git/Node selector over the unique merge-base-to-head cumulative PR
  diff. Paths are NUL-delimited data, never shell input; deletions and old/new
  rename paths both count. Unavailable/ambiguous/oversized/incomplete comparisons
  and unknown paths run all. Main pushes run all. Only explicit verified false
  outputs from a successful detector skip work; failed/missing outputs run work.
- Keep PM, conventions and delivery independent. Always call the Node reusable
  workflow and skip inside it, preserving the required nested check name. Default
  true keeps existing reusable consumers unchanged. No protection changes.
- Keep all four artifact suites on Python 3.9 and 3.14 in one runner, collecting
  failure while still attempting the other version. Run one unchanged bounded
  fixture transport under Node 24 after both pass. Fixed fixture bytes do not
  gain a different Node ABI from a second Python interpreter. No performance or
  monetary savings benchmark is claimed.
- Considered dorny/paths-filter v4.0.3 (2026-08-05 publication; Node >=24; four
  runtime dependencies). The repository-specific selector is under 100 lines,
  uses existing Git/Node and adds no dependency. Durable choice in decisions.md.

## Recovery and evidence limitations

The original CI session was stopped after repeated permission prompts despite its
displayed full-access label. A replacement resumed the same claimed branch and
preserved handoff. Its actual current metadata was independently checked as
approval=never, disabled permission profile and danger-full-access. File
create/read/delete, process inspection and authenticated GitHub API probes passed
without prompts. This restores this author session; it does not claim to fix the
desktop application's general permission propagation bug. No overlapping author.

`morpheus codebase-memory install --check` passed for this exact checkout. Both the
graph status/coverage calls returned Transport closed, so verification used exact
source, parsed workflow configurations and compiler-resolved test import closures.
No graph completeness claim. Documentation-only path classification is deliberately
conservative and must be updated when a suite gains a non-imported runtime input.

## Validation

- `pnpm install --frozen-lockfile` passed.
- `pnpm exec vitest run tests/ci-scope.test.ts tests/workflows.test.ts tests/artifact-workflows.test.ts`
  passed: 207 tests. Covers real cumulative Git histories/base advancement, empty
  diffs, both rename directions, deletion, hostile filenames, missing history/Git,
  malformed events, incomplete/oversized output, actual CLI outputs, parsed failure/
  cancellation conditions, actual browser/bridge imports and executable Python
  loop success/install/probe/suite failures.
- Initial test-only fixture errors (missing rename destination, PATH-isolated Bash
  lookup) were corrected. A newline filename initially conservatively ran all;
  the prose matcher now accepts opaque newline characters and the exact expectation
  passes. No test was weakened to bypass these failures.
- All four Python suites passed on local system Python 3.9.6 and Homebrew 3.14.7.
  The exact compatibility-step script also passed via uv-managed 3.9/3.14; log is
  checkout-local `local/handoffs/ci-python-compatibility.log`. These are local
  compatibility checks, not proof of Actions transport or native delivery.
- `pnpm typecheck`, `pnpm compile` and `pnpm morpheus pm index` passed; no generated output drift.
- Four deliberate selector mutations were killed by the focused tests: skip unknown
  paths, accept truncated paths, remove the output buffer bound, and ignore old
  rename paths. Original source restored; logs remain in local/handoffs/ci-mutants/.
- GitHub runs and independent review are recorded below.
  No local full-suite rerun: this change touches workflows/scripts/tests, not
  shared core. CI owns the full suite. No visual surface changed.
