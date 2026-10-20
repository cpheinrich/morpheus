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

Independent source review conditionally cleared RL439-001; the author extended
the control-character guard through C1 and proved the four new actual-script
regressions fail on the old guard. All required focused and source-fix CI checks
pass. This is source clearance only, with no runner, cancellation or delivery credit.

Root launched one fresh no-history reviewer `/root/runner_labels_review439`.
Its full raw report is retained under campaign private evidence
`source439-independent-review-2108/raw-report.md`, SHA256
`e445e9c24ebe78475b647a302611bde8753771dbf5afd94d0d56be112a06596b`;
sibling `timing.json` retains actual root clocks21:05:55.825889→21:08:55.523363Z.
The raw179697.474ms is recorded as integer179697ms, exactly2.99495minutes.
No prior reviewer/session or old operational clearance was reused.

The sole substantive finding accepted C1 controls U+0080–U+009F. Under its exact
two-path condition, fix `51a2851f12db5fcb0860c411a88050b4dabbc3fa` extends the
regex to `[\x00-\x1f\x7f-\x9f]` and adds U+0080/U+0085/U+009B/U+009F cases.
The new actual-script assertions first failed four times on the old regex
(actual exit0 versus expected1), then all225 tests in the original five-file
scope passed. Each rejected selector asserts exit1, exact fixed diagnostic,
empty stdout and empty output. Targeted actionlint, typecheck, compile, PM index
and diff checks pass; no dist change. Only the two reviewer-permitted source/test
paths changed in the fix; only this worklog changes after coverage.

Before-proof `/tmp/morpheus-runner-labels-c1-before-135243.log` SHA256
`dc423e3e74e6657abaa8a60ab2d22f6c0482e38ab01c98a0d44b6de88f2ad846`;
fixed focused output `/tmp/morpheus-runner-labels-c1-focused-135243.log` SHA256
`bd234c249fa75fb1f649f97a1febc0a6cd2c2ffe14f4f84bf7969297b08c19f3`.
The first post-push wait returned previous-head726e8af CI during provider lag;
that stale result is explicitly excluded. A fresh read established actual fix
head51a2851, then one wait for it returned CI green after1m31s (4SUCCESS,
3expectedSKIPPED). Exact raw readback is
`/tmp/morpheus-runner-labels-c1-ci-135243.json`. Final record-head CI is separately
required before root releases the draft/source gate; no future CI result is asserted.

Evo confirmed it will pin only this shared workflow and retain F65 actions/runtime.
The exact F65 and T4a workflow base blobs are identical
`ad07014ddc69061e37cd540c3db8eba8f4b5bcba`. The validator is wholly inline Node,
with no checkout/action or new-file dependency; existing native steps/actions-ref
remain unchanged. Full F→fix diff is retained privately. Actual consumer pin and
operational no-admission drill remain separate; PR is still draft/unlabelled/off.

```morpheus-review
{
  "version": 2,
  "base": "4a664c5be4e82b103ced3e4c85d7f2a433fa4c07",
  "reviewed": "726e8af4491a17eb53a407669c4052a6ba45d194",
  "covered": "51a2851f12db5fcb0860c411a88050b4dabbc3fa",
  "authorSession": "01a1572f-2ae1-77f2-be54-4265b3baca43",
  "reviewerSession": "/root/runner_labels_review439",
  "risk": "high",
  "elapsedMinutes": 2.99495,
  "timing": {
    "source": "clock",
    "durationMs": 179697,
    "evidence": "Root clock before fresh reviewer spawn2026-10-20T21:05:55.825889Z through final report receipt2026-10-20T21:08:55.523363Z. Raw179697.474ms retained in source439-independent-review-2108/timing.json; integer record179697ms includes tools/waits, with no estimated duration or floor delay."
  },
  "outcome": "complete",
  "summary": "Independent source review conditionally cleared RL439-001; the author extended the control-character guard through C1 and proved the four new actual-script regressions fail on the old guard. All required focused and source-fix CI checks pass. This is source clearance only, with no runner, cancellation or delivery credit.",
  "findings": [
    {
      "id": "RL439-001",
      "severity": "substantive",
      "description": "The C0+DEL regex accepted C1 control characters U+0080–U+009F, allowing forbidden invisible characters into native scheduling. Actual-script cases U+0080, U+0085, U+009B and U+009F returned exit0 and emitted selectors; expected exit1, established diagnostic and empty output.",
      "paths": [".github/workflows/ios-ci.yml", "tests/ios-runner-labels.test.ts"],
      "disposition": "fixed",
      "response": "Exact fix51a2851f12db5fcb0860c411a88050b4dabbc3fa changes only the reviewer-permitted YAML regex and actual-script regression cases. All four new cases fail the old guard and pass the complete C1 guard. Existing ordinary/optional routing, diagnostics and no-fallback behavior are retained.",
      "condition": {
        "paths": [".github/workflows/ios-ci.yml", "tests/ios-runner-labels.test.ts"],
        "evidence": "Extend rejection to the complete C1 range, preserving existing behavior; [\\x00-\\x1f\\x7f-\\x9f] is sufficient. Add actual-script U+0080, U+0085, U+009B and U+009F regressions asserting exit1, exact diagnostic and empty output; demonstrate assertions fail old regex. Run the original five-file focused command, targeted actionlint, typecheck, compile, PM index and final-head CI; record exact fix SHA/results. No further reviewer turn required if met exactly."
      },
      "conditionMet": "Fix51a2851f12db5fcb0860c411a88050b4dabbc3fa only changes the two allowed paths. Four actual-script assertions fail on old regex, retained before-proof SHAdc423e3e74e6657abaa8a60ab2d22f6c0482e38ab01c98a0d44b6de88f2ad846. Original five-file focused suite225PASS, fixed-output SHAbd234c249fa75fb1f649f97a1febc0a6cd2c2ffe14f4f84bf7969297b08c19f3. actionlint/typecheck/compile/PM index/diffcheck pass; dist unchanged. Verified exact fix-head51a2851 CI green after1m31s, 4SUCCESS+3expectedSKIPPED; raw /tmp/morpheus-runner-labels-c1-ci-135243.json. Stale previous-head wait excluded. Only review worklog follows covered; final record-head CI must pass before root releases source gate."
    }
  ]
}
```
