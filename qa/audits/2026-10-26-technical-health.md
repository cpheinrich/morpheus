# Morpheus technical-health audit — 2026-10-26

Baseline: `a50cdbb1cb84` (`origin/main`). Scope: 2,093 tracked files, root and nested production
dependency graphs, dead-code and tracked-artifact inventories, code-language similarity,
TypeScript complexity, repository-native validation, governance, and hosted runs.

## Executive summary

Three independently installed Zod 4.4.3 graphs expose the high-severity
GHSA-mrhx-c7xc-m3w5 collection-validation memory-exhaustion advisory. Existing draft
[#464](https://github.com/cpheinrich/morpheus/pull/464) now removes it from the root graph and
existing draft [#513](https://github.com/cpheinrich/morpheus/pull/513) now removes it from the
Paperclip HQ graph; both were refreshed onto current main instead of duplicated. The plugin graph
remains exposed: exact-branch testing proves [#522](https://github.com/cpheinrich/morpheus/pull/522)
does not change its direct Zod dependency, while the governed plugin-remediation claim hung twice
before branch creation. No ungoverned branch was created.

This audit branch removes one unreachable web-template generator and stops exporting one internal
path constant. Current-main schedules are green. Measured production-code duplication remains low,
but 69 functions exceed the complexity threshold and should be split only behind behavior-pinning
tests in focused domain work.

## Ranked findings

| Rank | Finding | Evidence | Confidence | Impact | Next action |
|---:|---|---|---|---|---|
| 1 | **Urgent: three production graphs install vulnerable Zod** | Root, `plugins/codex-claude`, and `scripts/paperclip-hq` each resolve direct `zod@4.4.3`; `pnpm audit --prod` reports GHSA-mrhx-c7xc-m3w5, patched in 4.6.6. Draft #464 is current at `095d4d30` and audits clean. Draft #513 is current at `22eb5467`, resolves Zod 4.6.6, and no longer reports this advisory. Exact testing of #522 still resolves plugin Zod 4.4.3 and reports the high advisory. The governed item `MO-26-10-26-09.29.44` could not create its branch because `pm claim` hung twice at the same point. | Certain for installed versions and audit output | High availability risk wherever oversized constrained collections can reach validation | Independently review #464 and #513. Resume the plugin item only after the claim mechanism can create its governed branch; do not treat #522 as the Zod vehicle. |
| 2 | Paperclip HQ retains a separate moderate transitive UUID advisory | After #513, `pnpm audit --prod` reports only GHSA-w5hq-g745-h8pq through `@google-cloud/functions-framework@5.0.5 > cloudevents@10.0.0 > uuid@8.3.2`. The Functions Framework and CloudEvents releases are current, and CloudEvents still selects UUID `^8.3.2`; the patched UUID line begins at 11.1.1. | Certain for the installed and upstream graphs; medium for runtime exploitability | Moderate dependency-hygiene risk; a forced cross-major override could introduce transport incompatibility | Keep this out of #513. Add compatibility tests and a separate governed draft only when the claim path works or upstream widens its UUID selector. |
| 3 | Stateful orchestration remains structurally concentrated | ESLint complexity 20 reports 69 functions above threshold. Leaders include `gh-manager/sweep.ts` `sweep` (84), `doctor` (78), CD invariants (69), `init` (69), CD CLI (68), review-local (68), QA CLI (63), preview config (61), and CD controller (60). | Certain for the metric; high for the regression interpretation | Medium-high regression risk at governance, repair, and deployment seams | Split by domain only behind behavior-pinning tests; a blanket audit-week refactor is not independently reviewable. |
| 4 | Exact duplication is low but gives a bounded consolidation inventory | `jscpd` over `src`, `plugins/codex-claude/src`, `scripts/paperclip-hq`, and `.github/actions` found 31 clones and 315 duplicated lines across 247 code files (0.56%) at six-line/50-token thresholds. | Certain for the measured scope | Low current drift risk | Consolidate only when a clone next changes and the shared behavior can retain explicit workflow/generated boundaries. |
| 5 | Two dead/internal exports were safe to remove | `readmeSection` appeared only at its definition in `src/web/templates.ts`; the graph recorded zero relationships and Knip identified it as unused. `TEAM_DIR` is consumed only inside `src/paths.ts`, and `./paths` is not a package export, so its public export was unnecessary. Direct repository search found no consumers. | High | Low maintenance and accidental-API surface | Included here: delete `readmeSection`; make `TEAM_DIR` module-private; keep focused tests and build output current. |
| 6 | No additional dependency, asset, or obsolete-file deletion met the evidence bar | Knip's apparent Firebase and `@types/js-yaml` dependency candidates are exercised by rules/CLI tests or typed test imports. No tracked macOS metadata, bytecode, backups, or editor-recovery files were found. Broader dead-code candidates were entry points, callbacks, records, or generated surfaces when checked directly. | High for the bounded inventories; not an exhaustive proof of every entry point | Low | Require a direct-consumer trace before future deletion; do not promote analyzer absence to proof. |
| 7 | Current-main hosted health is green | The latest ten scheduled runs through run `40358341156` completed successfully on exact main `a50cdbb1`. Main requires `node / check`, `pm / pm`, `pr / conventions`, and `agent-review / delivery`; repository `delete_branch_on_merge` is enabled. | Certain | Low immediate CI risk | Treat a future scheduled failure as an incident; green automation is not evidence for unexercised behavior. |

## Validation and limits

- Root audit remains high until focused draft #464 lands; plugin audit remains high until its
  governed branch can be created. Paperclip draft #513 removes its high Zod advisory and leaves
  the distinct moderate UUID advisory explicitly visible.
- The exact audit-worktree graph was fully generated at `a50cdbb1` with 11,956 nodes and 39,004
  edges, no skipped files, and ten parse-partial files. Direct source was read for the relevant
  flagged `src/web/consumer-auth/templates-tests.ts` ranges; they are embedded generated-test
  strings and do not affect the dead-export findings. After compaction the MCP transport closed,
  so final coverage re-query was unavailable. Direct source/search is the final evidence and no
  graph-completeness claim is made.
- Focused tests, typecheck, lint, compile, PM index, and governance validation are recorded in the
  worklog. Exact-head hosted CI and fresh independent review remain required before readiness.

## Focused remediation vehicles

- [Draft #464 — root Zod remediation](https://github.com/cpheinrich/morpheus/pull/464)
- [Draft #513 — Paperclip HQ Zod remediation](https://github.com/cpheinrich/morpheus/pull/513)
- [PR #522 — MCP SDK advisory](https://github.com/cpheinrich/morpheus/pull/522) remains a separate,
  already-green automated dependency vehicle; it neither fixes nor represents the plugin Zod
  finding.
