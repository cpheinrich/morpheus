# iOS runner label conjunctions — MO-26-10-20-13.52.43

The existing reusable workflow accepts one runner string. Add an opt-in
`runner-labels-json` string, empty by default. Nonempty input is validated by a
two-minute hosted Ubuntu job with its own execution-ID-aware concurrency group.
Node's built-in parser rejects malformed JSON, nonarrays, empty arrays, nonstring
or blank labels, surrounding whitespace, control characters and case-insensitive
duplicates. Canonical output retains every label in order. Actions `fromJSON`
selects that conjunction only after successful validation; invalid input never
falls back to the ordinary runner. Empty input skips validation and retains the
ordinary runner string. All existing native steps and evidence remain unchanged.

Built-in Node JSON and Actions expressions are sufficient for this small
runner-specific boundary, so no third-party action/package or generic parser was
added. GitHub documents cumulative matching and case-insensitive labels:
[routing](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/use-in-a-workflow),
[labels](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/apply-labels),
[fromJSON](https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#fromjson).

## Source compatibility and limits

Exact live F65 source at controller.ts191–207 filters local jobs by configured
localRunner/self-hosted labels, so the Ubuntu validation job is excluded from
its local no-start predicate. Its hosted terminal predicate also permits completed
Ubuntu jobs. T4a controller.ts35–51 explicitly accepts Ubuntu preflight companions
and skipped/unassigned downstream jobs. These are source inspections, not live
observations. F65's pre-existing overall-run timeout and weak no-start evidence
remain unchanged; this seam does not correct or authorize them.

Root accepted the extra skipped validation check for ordinary callers. The Evo
author coordinated the API for an independently reviewed, validation-only exact
label conjunction. Consumer source/merged dependency, runner inventory, arming,
dispatch, cancellation and real hosted delivery remain separate gates. No live
workflow dispatch, host/runtime/controller/worker/provider/ledger/model operation
or actual queue proof occurred here.

## Validation

- `pnpm typecheck` — pass.
- `pnpm exec vitest run tests/ios-runner-labels.test.ts tests/ios-change-scope.test.ts tests/ios-evidence-workflow.test.ts tests/ios-build-cache.test.ts tests/workflows.test.ts`
  — 221 tests passed across five files. This covers the changed reusable workflow
  and its direct native routing/scope/cache/evidence consumers; no full local suite.
- `actionlint .github/workflows/ios-ci.yml` — pass.
- `pnpm compile` — pass, no generated dist change.
- `pnpm morpheus pm index` — pass, indexes unchanged.
- `git diff --check` — pass.

The first broader focused run found the new validator lacked the required
concurrency guard. Added the execution-ID-aware guard, then the same five-file
scope passed. The new tests execute the actual YAML's validation script, plus
evaluate its fixed boolean/string/array expressions using matching fixture
semantics. They do not simulate GitHub's scheduler or constitute empirical native
delivery evidence.

Targeted workflow mutations: 15/15 assertion-killed, zero survivors. They cover
default opt-in drift, skipped selection, scalar/empty/blank/whitespace/control
admission, duplicates/case folding, dropped labels, missing dependency, ordinary
skip behavior, failed-validation fallback, ignored arrays and cancellation.
The original YAML was restored in `finally`; the final validation rerun checks
that restored source. Harness `/tmp/morpheus-runner-labels-mutations-135243.py`
SHA256 `727e8142ba6889709951b7269d0b3f516fabf63e4305a5ed08954e0f9af78eea`;
results `/tmp/morpheus-runner-labels-mutations-135243.json`
SHA256 `d43c4304e290f67168f144fe7e822c7293d3e5b7ce9da8d642bf1bad2d50d2d2`.

Graph orientation: primary index at T4a, generation2026-10-20T20:52:53Z,
8380 nodes/24807 edges. Relevant workflow/direct test/docs coverage reported
metadata_match/no_recorded_issue, a best-effort signal. The exact task checkout
was then indexed by normal bootstrap; its follow-up status call returned
Transport closed. Actual YAML/source reads are authoritative; no completeness
claim. PM claim removed CODEX_THREAD_ID only in that subprocess and retained all
existing session associations. An initial asynchronous claim handoff created an
uncommitted local branch; recovered only that exact-trunk never-pushed branch,
then successfully claimed the final isolated task checkout. Unused prepared
checkouts retain their generated reconciliation edits for guarded later cleanup.

## Independent review and release

Not started. Root coordinates one fresh independent source reviewer after the
complete packet and CI. PR remains unlabelled draft, auto-merge off, with the root
source merge gate held. No prior reviewer/session or old operational clearance
is reused.
