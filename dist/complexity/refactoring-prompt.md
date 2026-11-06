# Behavior-preserving refactoring prompt

**Version 1.5 (2026-11-05).** Printed by `morpheus complexity prompt`; the canonical copy is
`src/complexity/refactoring-prompt.md` in Morpheus. It was refined over a multi-agent pilot and a
production baseline refactor; each revision added a rule after review found a specific
behaviour change in a refactor that tests and metrics had passed. Change it in Morpheus, not in a
project copy.

## Supplying the inputs

Give the agent this prompt plus the task's own values. Anything not supplied takes the default.

| Input | Default |
|---|---|
| Repository and claimed worktree | the current task worktree |
| Base revision | the merge base with trunk, as `morpheus complexity check` reports it |
| Analyzer revision | the Lizard pin `morpheus complexity install --check` reports |
| Declared scope | routine work: the function families your change touches; a baseline: the project's whole `complexity` scope |
| Candidate report | `morpheus complexity check` (or `--all` for a baseline); `--json` for the rows |
| Cyclomatic limit | `complexity.ccn` in `morpheus.json` (15) |
| Acceptance commands | the project's focused tests for the changed files; a full suite only when the task or the project's instructions require it |
| Change budget | the task's; otherwise the smallest change that resolves the findings |

Metrics for step 13: `morpheus complexity check --json` lists every function in each measured file
(`files[].functions[]`: `longName`, `start`, `end`, `ccn`, `cognitive`, `nloc`, and `targeted` when
the check judged it). Run it on the final source, and with `--all --json` in a detached worktree at
the base revision, then take the same family's rows from both. A row named `*global*` is the file's
top-level code, not a family member: leave it out of family totals on both sides, and report it
separately when the change moved top-level code.

## Task inputs

Use the supplied repository, base revision, analyzer revision, supported-language scope, candidate report, cyclomatic limit (default 15), acceptance commands and change budget. Follow the repository's current instructions and the human's engagement-specific directions. Treat static findings as investigation leads, not proof of defects. Cognitive complexity is advisory unless the task explicitly states otherwise.

## Objective

Preserve supported behavior while making the code easier to understand, change and test. Prefer explicit invariants, coherent responsibilities, actual reuse, and fewer concepts. A lower entry-function score is insufficient if the complete changed code becomes harder to follow.

## Before editing

1. Freeze the base source and analyzer versions. Enumerate the complete declared scope, exclusions and every recognized function over the limit. Separate application/tooling, tests, generated/vendor and unsupported syntax. State analyzer coverage limitations; do not infer complete language coverage from a successful parse.
2. Read each candidate's complete body and relevant callers, callees, types, tests and invariants. Identify the particular duplication, nesting or mixed responsibility worth improving. Derive the design from source; no function-specific recipe is supplied.
3. Identify existing behavior tests and add missing characterization assertions before moving important logic. Assert actual values, ordering, errors, state and boundary behavior. A no-throw or nonempty assertion rarely establishes preservation.

## Refactoring rules

4. Choose the smallest useful simplification. Prefer clearer control flow, named domain operations and reuse of genuinely identical behavior. Extract a helper when it names a coherent responsibility, rather than one helper per branch. Avoid frameworks, new dependencies, extra state/options, public API changes and unrelated cleanup unless required by the task.
5. Preserve validation, precision/rounding, serialization and ordering, errors and recovery, side effects, ownership, actor/queue isolation, cancellation, observable asynchronous ordering and publication boundaries. Keep cancellation and account/revision checks after the same awaited operations; avoid new yields on skipped stages that change observable ordering. Preserve the evaluation order of expressions that may be effectful, including injected clocks, getters and callbacks. Preserve a callback's receiver and whether it is captured once or read again at invocation; extraction must not silently detach a method or change when its property is read. Do not assume purity without a contract or change a guard while extracting a shared predicate. Preserve partial results and mutations already established when a later operation throws; extracting a try/catch must not silently roll them back.
6. Preserve existing supported cases and safeguards. If inspection exposes a pre-existing bug or nondeterminism, record it separately; don't silently change behavior as part of a cleanup. Any intentional behavior change needs explicit task authority, tests and a clear description.
7. Aim to keep every changed/new function within the cyclomatic limit, including helpers and affected enclosing functions. Seek a useful cognitive reduction without treating that score as correctness. Never hide branches in unmeasured properties/closures, exclusions, generated code, renamed symbols or analyzer blind spots.
8. If a target would force a worse design or the analyzer is wrong, retain the clearer code and state the exact proposed exception. An exception is a visible unresolved acceptance item until approved; do not claim the entire scope meets the limit while exceptions remain. Exhaust the simpler coherent design before proposing retention.

## Validation and profiling

9. Use the project's supported build/test wrappers in its claimed implementation worktree. Bound exploratory harness/dependency work; do not reconstruct the whole app to finish a proposal. For implementation, complete the actual acceptance commands supplied by the task, including full unit/UI suites when explicitly required. Syntax checks and isolated harnesses are supplemental evidence, not application acceptance.
10. Keep first failures and diagnose them. Fix actual defects and rerun affected checks after changes, then run the required final-source acceptance. Do not weaken assertions, add skips, delete checks, or rerun unchanged failures until green. Investigate pre-existing failures separately with retained baseline evidence. For an extracted asynchronous stage, compare an observable call/state trace for both its taken and bypassed paths. Include injected clocks and callback/property reads in the trace when they move across a helper call: matching final values alone can miss changed evaluation timing.
11. When profiling is requested, benchmark actual before/after code with the same compiler/optimization, fixed representative inputs, output checksums, warmup and repeated paired samples. Retain raw timings and report median plus spread. Distinguish CPU work, allocations and external latency where measurable. Limit conclusions to the measured workload; noise is not a speedup. Avoid trading clarity for an unmeasured performance claim. For CPU-heavy loops touched by extraction, include a focused before/after timing check: shared callbacks, helper calls and per-iteration objects can add cost despite identical outputs. Investigate substantial repeatable regressions before accepting the refactor; preserve the arithmetic while changing the decomposition.

## Required output

12. Produce code and a disposition for every original candidate: refactored, retained with explicit exception, or unresolved. Re-scan the complete scope after editing so newly complex helpers and missed files cannot disappear from the report.
13. Generate before/after CCN, cognitive and NLOC mechanically for the complete changed families. Include new/removed helpers and affected enclosing functions. Use identical family membership rules on both sides; count an unchanged helper on both sides or neither. Report added concepts/call boundaries and total size as well as entry-function scores.
14. Save exact runnable validation and benchmark commands/scripts, source/analyzer/toolchain revisions, test IDs/counts/results, failures/retries and unrun checks. Distinguish source inspection, syntax, typecheck, harness behavior, actual unit/integration and simulator UI evidence. Do not claim equivalence from a metric or tests passed without execution.
15. Inspect each complete changed family by hand and summarize what changed, why it should help, preservation risks and measured performance effects. Provide the reviewer the final diff, coverage/exception inventory and evidence. Follow the task's review/PR/merge instructions; a passing test suite never authorizes a merge that the human reserved for review.
