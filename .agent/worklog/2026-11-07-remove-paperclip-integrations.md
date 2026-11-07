---
id: MO-26-11-07-09.06.49
title: "Remove active Paperclip integrations"
date: 2026-11-07
tags: [engineering, devops, factory]
---

# Remove active Paperclip integrations

## Mandate and boundary

Chris authorized retirement; the controller supplied a cleared deletion boundary after an
independent read-only design audit. This author owns only the isolated Morpheus checkout and
bundled Factory source. Deliver an unlabelled draft and exact-head packet; the controller owns
independent implementation review and coordinates protected delivery and installation.
No other author, runtime service, configuration, credential or original checkout was changed.

## Implementation

Delete Factory Pool/HQPool imports, fields, admission/control, legacy dispatch and stopAll;
remove unused pool authority ranks/check and seven pool modules, runners, prompt and fixtures/tests.
Retain retired CLI refusal and test rejected internal dispatch plus all six direct routes.
Delete pilot/bridge/HQ executables, dedicated tests/package and HQ workflow. No extra CI selector
named those paths; the remaining closeout-history workflow is intentionally retained.

Workflow-repair retains offline fixture freezing, plan/schedule/trace helpers and scoring;
remove its provider/API/process collector and related tests, with a CLI retirement regression.
The agent-stack harness does not launch anything: its frozen bytes, manifest and worker instructions
remain unchanged. No tracked `.agent/paperclip*` record changed. Offline closeout export/render/
append-only validation source and workflow remain unchanged. Historical design documents get
retirement notices; current overview/navigation/architecture and DevOps skills/generated guide
reflect removal. Optional host planner comments/design lose actionable Paperclip coupling;
generic planner, Xcode/CI pools and read-only reporter remain.

No generic module was written and no new dependency was considered necessary for this deletion.

## Validation

Focused repository checks (no full local suite: shared core was not touched):

- `pnpm typecheck` — passed.
- `pnpm exec vitest run tests/paperclip-closeout.test.ts tests/paperclip-closeout-markdown.test.ts tests/workflow-repair.test.ts tests/ci-scope.test.ts tests/cto.test.ts tests/project-skills.test.ts`
  — five existing files, 111 tests passed. The `cto.test.ts` selector does not exist; the real skill
  suite was then explicitly selected below rather than treating it as covered.
- `pnpm exec vitest run tests/agentic-cto-skill.test.ts tests/factory-distribution.test.ts`
  — 46 tests passed, including canonical/provider/generated parity and CLI distribution.
- `/usr/bin/python3 -m unittest discover -s qa/evals/workflow-repair -p 'test_*.py'`
  — 30 offline controls passed; no provider launch.
- `node qa/evals/agent-stack/harness.mjs verify` — `changed: []` against the original manifest.
- `node scripts/sync-agentic-cto-skill.mjs`, `pnpm compile`, `pnpm morpheus pm index`
  — generated guide refreshed; PM indexes unchanged.
- `pnpm --dir plugins/factory run check` and `pnpm --dir plugins/factory test`
  — passed, 139 tests, zero failed/skipped. Direct gateway, worktree/process ownership and retired
  CLI contracts are exercised by the retained suite.
- `pnpm --dir plugins/factory/src/host typecheck` — passed.
- `pnpm --dir plugins/factory/src/host exec vitest run tests/admit.test.ts tests/config.test.ts tests/plan.test.ts tests/place.test.ts tests/capacity.test.ts`
  — 68 generic planner tests passed.
- `pnpm --dir plugins/factory/src/host run test:reporting` — 89 read-only reporter tests passed.
- `node dist/cli/index.js complexity check` — passes, enforce CCN 15/cognitive advisory 15;
  23 touched functions, 298 in 11 measured files; only generated `dist/**` excluded.
- Temporary mutation restored the old pool dispatch: the new regression failed at its injected
  controller tripwire. Source was restored and the targeted regression passed.
- `git diff --check` — passed. Source literal audit found no Paperclip runtime client/dispatch
  in `src`, Factory source/scripts or remaining workflow execution paths. The bridge CLI's
  `pool.*`/`pool-*` refusal, offline closeouts and frozen study references are intentional.

## Diagnosis and limitations

Startup's installed CLI was stale and this exact checkout had no index. Per the controller's
no-install boundary, neither was repaired. Used the committed CLI and Tier 2 graph for the nearest
indexed checkout (generation 2026-11-07T07:58:46Z), with direct current source/literal scans for
implementation. Coverage metadata matched the candidate code paths; Firebase prototype config,
rules and tsconfig lacked tracked metadata and were read from exact Git blobs before deletion.
Excluded dependency/build/cache trees were not treated as source evidence. The read hook reported
none of the visible context reads, so the documented `MORPHEUS_READ_EVIDENCE=off` assertion receipt
was used; it grants no review or deployment waiver.

The first plugin dependency command resolved the parent workspace, leaving standalone imports
missing. Retried with its frozen lockfile and `--ignore-workspace --ignore-scripts`; the suite
then passed. An initial host selector `tests/core.test.ts` matched no tests; the five actual
planner suites above passed. Dependency installs were checkout-local test setup, not runtime
installation. No local full Morpheus suite was run; protected CI still owns it.

## Delivery and install proof plan

Independent review is pending and no clearance is claimed. No merge, runtime install, service
stop or configuration/credential mutation is authorized in this author run. After controller
review and green protected CI, use the exact reviewed merged source for the explicit Factory
installer; verify installed/cached files match that source, no legacy pool modules/runners remain,
the six direct tool names match, legacy internal operations reject, and one controller-owned
canary proves gateway/workspace/native-session correlation and cleanup. Installer update/drain
must preserve the current worker and existing process owners. The controller separately owns
retired service/config cleanup, standalone parity and consumer acceptance. Source retirement
alone does not remove an already-running controller or stale installed copy.

Host parity patch scope: `plugins/factory/src/host/core/{admit.ts,cli.ts,types.ts,brokers/http.ts}`
and `plugins/factory/src/host/docs/design.md`. Standalone and Darwin authors remain separate.
No product-scope questions are unresolved; review, CI and installation are explicit next stages.

## Independent implementation review and delivery continuation

Independent high-risk source review cleared the exact implementation head with no findings or unresolved source questions. Direct Factory ownership contracts and offline history are preserved; runtime shutdown, installation and cloud cleanup were outside the review.

The controller supplied the completed reviewer result and measured endpoints above. The reviewer
ran 39 focused Factory tests and the dependency-free installer test, all 30 offline Python
controls, synthetic offline score/summarize CLIs, frozen input verification and archive validation
(four preserved, zero added). Mirrors/dist and source audit matched. Its optional root Vitest
rerun could not collect because dependencies were absent in the review checkout; no test execution
is claimed for that attempt. The author’s passing focused runs remain recorded above.

The controller then authorized this author to record clearance, validate conventions, make PR644
ready and merge only through protected exact-head checks. No source correction was needed.
Trunk advanced by the independently merged QA composer fix (#643); Git integrated it without
conflict or hand edits. Merge hooks were disabled for that one Git operation solely to prevent
a managed CLI auto-install, honoring the explicit no-runtime-install boundary. Required review
validation, conventions and CI are run explicitly; no delivery gate is waived. The original
base/reviewed/covered hashes are preserved under the repository’s trunk-integration policy.

The initial draft/install handoff above describes the earlier stage. Runtime actions remain with
the controller; this continuation performs no installation, restart, IAM or archive mutation.

```morpheus-review
{
  "version": 2,
  "base": "a4eb3903645ae6dcf70687fb1ecbdd8db3652e81",
  "reviewed": "5ec79a02b4baf8b3b92bec06c1e613c0597a723d",
  "covered": "5ec79a02b4baf8b3b92bec06c1e613c0597a723d",
  "authorSession": "01a1b6f8-9d27-7811-b6d2-cd475df0b052",
  "reviewerSession": "01a1b702-0029-7f81-aadf-0bc7e09219bd",
  "risk": "high",
  "elapsedMinutes": 4.369783333333333,
  "timing": {
    "source": "clock",
    "durationMs": 262187,
    "evidence": "Controller clock immediately before dispatch: 2026-11-07T17:15:23.523Z; first terminal=true result: 2026-11-07T17:19:45.710Z. Factory run 4a7362b5-79e6-43cb-8869-1b8f83851ab6; reviewer session 01a1b702-0029-7f81-aadf-0bc7e09219bd. Both actual endpoints supplied by the supervising controller."
  },
  "outcome": "complete",
  "summary": "Independent high-risk source review cleared the exact implementation head with no findings or unresolved source questions. Direct Factory ownership contracts and offline history are preserved; runtime shutdown, installation and cloud cleanup were outside the review.",
  "findings": []
}
```
