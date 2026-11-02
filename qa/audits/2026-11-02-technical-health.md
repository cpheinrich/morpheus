# Morpheus technical-health audit — 2026-11-02

Baseline: `ae147cb6a1c2` (`origin/main`). Scope: 2,361 tracked files; root, Factory, and
Paperclip HQ production dependency graphs; dead-code/dependency/asset inventories; duplication
and structural hotspots; tests, hosted CI, governance, and open remediation state.

## Executive summary

**Urgent:** the production-reachable Factory MCP graph exposed four high-severity advisories:
two in `@modelcontextprotocol/sdk@1.31.0`, one in direct `zod@4.1.12`, and one in transitive
`body-parser@2.3.0`. Existing [draft #576](https://github.com/cpheinrich/morpheus/pull/576) was
the correct non-duplicate vehicle. It now updates the SDK and Zod, regenerates the committed
lockfile to patched runtime transitives, passes 134 focused tests, and reports no known production
vulnerabilities locally.

The other production Zod graphs remain isolated in refreshed drafts
[#464](https://github.com/cpheinrich/morpheus/pull/464) and
[#513](https://github.com/cpheinrich/morpheus/pull/513). The root minimatch major upgrade is
isolated in refreshed [draft #570](https://github.com/cpheinrich/morpheus/pull/570), with its
visual-evidence path behavior pinned by 127 tests. This audit branch removes the obsolete
`@types/js-yaml` package because `js-yaml@5.4.1` now publishes its own declarations. No other
dead-code, dependency, asset, or obsolete-file candidate met the direct-evidence bar for safe
deletion.

## Ranked findings

| Rank | Finding | Evidence | Confidence | Impact | Next action |
|---:|---|---|---|---|---|
| 1 | **Urgent: Factory runtime dependency graph exposed remotely reachable high advisories** | Factory runtime entry points import the MCP SDK; config/pool modules import Zod. The installed graph contained SDK GHSAs `46jr` and `22jm`, Zod GHSA `mrhx`, and body-parser GHSA `27r3`. Draft #576 now resolves SDK 1.32.0, Zod 4.6.6, body-parser 2.4.0 and patched Hono, node-server, IP, query-string and URI transitives. Frozen install, 134 tests, package check and `pnpm audit --prod` pass. | Certain for the installed/runtime graph and advisory versions | High availability and request-isolation risk | Freshly review #576 and require exact-head CI. It remains draft with auto-merge off. |
| 2 | **Root and Paperclip HQ retain independently installed high-severity Zod on main** | Root installs Zod 4.4.3 and Paperclip HQ installs direct Zod 4.4.3 on main; GHSA `mrhx` is fixed by 4.6.6. Refreshed draft #464 is current and compiles the affected declarations; refreshed draft #513 is current and its standalone build/package check pass. | Certain | High memory-exhaustion risk on oversized constrained collections | Freshly review #464 and #513. Both remain draft with auto-merge off. |
| 3 | **Root minimatch requires a behavior-changing major security update** | Root direct minimatch 10.2.6 has GHSA `g3hv`; 11.0.1 is patched and removes internal APIs. Production uses only the preserved top-level matcher in `src/check/visual-evidence.ts`. Draft #570 is current; typecheck, compile and all 127 checker tests pass, including include/exclude path contracts. | High | Moderate denial-of-service and compatibility risk | Freshly review #570 and require exact-head CI; do not fold this major update into the audit branch. |
| 4 | **Duplication is still low overall but is concentrated in stateful orchestration** | `jscpd@5.4.2` over `src`, `plugins/factory/src`, `scripts/paperclip-hq`, and `.github/actions` found 43 clones / 435 duplicated lines across 293 files (0.63%). Factory `service.mjs` contains four 10–15-line pairs around start/control flows; CD quota readers contain five 7–11-line TypeScript pairs. | Certain for the measured scope; medium that consolidation is safer | Moderate drift risk in security- and lifecycle-sensitive code | No audit-week refactor: the clones cross distinct authority/state transitions and current tests do not establish a shared behavioral contract. Extract only in a focused governed item after pinning both flows. |
| 5 | **One obsolete ambient type package was safe to remove** | Knip flagged `@types/js-yaml`; direct package inspection shows `js-yaml@5.4.1` exports `./dist/js-yaml.d.ts`, and no tsconfig or source references the legacy package. Locked reinstall removes one package; typecheck and 429 tests across 14 YAML-consuming suites pass. The fifteenth consumer suite needs actionlint and is left to exact-head CI. | High | Low dependency and declaration-resolution noise | Included in the audit branch. |
| 6 | **Structural hotspots need domain work, not blanket cleanup** | The current graph's high-fan-in nodes include GitHub-manager descriptions and CD state/schema helpers. Candidate cognitive leaders include Paperclip supervisor argument/config/termination/slot functions and Factory `foldLine`; direct inspection shows security-boundary validation and state-transition logic rather than dead branches. | Medium-high; the exact audit worktree could not be indexed | Medium regression risk if changed without boundary tests | Keep as a monitored inventory. Any split needs a focused design, behavior-pinning tests, and a separate governed draft. |
| 7 | **Current-main test, CI, asset, and governance hygiene is sound** | Exact-main CI run `41208917048`, Paperclip run `41208917027`, and latest schedule run `41488580269` succeeded. Main is strict and requires `node / check`, `pm / pm`, `pr / conventions`, and `agent-review / delivery`. The tracked tree contains no macOS metadata, bytecode, backup, reject, swap, cache, or coverage artifacts; its only media asset is documented and referenced. | Certain for live queried state and bounded inventory | Low immediate operational risk | Preserve strict checks; treat new scheduled or exact-main failures as incidents. |

## Inventory detail and limits

- Knip reported no unused production dependency, unlisted dependency, or unresolved import. Its
  remaining dev-dependency candidates are retained: `@firebase/rules-unit-testing` is imported by
  the Firestore rules suite, and `firebase` supplies the `test:rules` CLI. Its file/export list is
  not deletion evidence in this multi-entry CLI/template repository; candidates were traced
  directly before any action.
- The graph at current main contains 13,712 nodes and 45,655 edges. Its full generation was made
  on 2026-10-31 with no skipped files. Coverage reports parse gaps in four embedded-template ranges
  of `src/web/consumer-auth/templates-tests.ts` and twelve large test files. The template ranges
  and test files were read directly for material claims. A worktree-specific refresh could not
  replace the active server generation because other live sessions prevented a safe restart; no
  graph-completeness claim is made beyond the supplied current-main generation and direct fallback.
- The duplication inventory is an inventory, not a demand to abstract every clone. Generated,
  runner-specific, and deliberately independent authority boundaries remain explicit.
- Paperclip draft #513 still reports three moderate upstream transitive findings: UUID through
  Functions Framework/CloudEvents, plus `glob`/`minimatch` through Firebase/Firestore/Google auth.
  Their patched lines require upstream-major compatibility work; #513 does not pretend they are
  fixed.

## Focused remediation vehicles

- [Draft #576 — Factory runtime dependency advisories](https://github.com/cpheinrich/morpheus/pull/576)
- [Draft #464 — root Zod remediation](https://github.com/cpheinrich/morpheus/pull/464)
- [Draft #513 — Paperclip HQ Zod remediation](https://github.com/cpheinrich/morpheus/pull/513)
- [Draft #570 — root minimatch major/security remediation](https://github.com/cpheinrich/morpheus/pull/570)

All remain open with auto-merge disabled. Fresh independent review and exact-head hosted checks are
required before any is ready.

## Audit-branch validation

Typecheck, lint, compile, PM index/validation, team validation, inbox validation, and diff checks
pass. The exact focused command was:

```sh
pnpm exec vitest run tests/workflows.test.ts tests/ios-change-scope.test.ts tests/ios-runner-labels.test.ts tests/init.test.ts tests/lint-contract.test.ts tests/workflow-expressions.test.ts tests/ios-build-cache.test.ts tests/upload-configuration.test.ts tests/ci-scope.test.ts tests/ios-nightly-recovery.test.ts tests/ios-evidence-workflow.test.ts tests/firebase-release.test.ts tests/upload-receipt.test.ts tests/ios-test-retry.test.ts tests/artifact-workflows.test.ts
```

Fourteen files passed 429 tests after the ambient type-package removal.
The six actionlint-backed cases in `tests/workflow-expressions.test.ts` could not start because
actionlint 1.7.12 is not installed on this host; exact-head CI downloads and checksum-verifies that
binary. This environmental gap is explicit and the unchanged failing invocation was not repeated.
