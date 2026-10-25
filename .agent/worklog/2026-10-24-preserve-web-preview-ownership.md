---
date: 2026-10-24
roadmap: MO-26-10-24-23.43.56
agent: codex
---

# Web preview ownership survives display renames

Issue #494 came from the final cpheinrich QA cleanup: the manifest name changed while its temporary checkout root did not. `webKey` already followed the checkout/dev directory, but `webContext` put both session.json and the launchd label beneath the name-derived namespace. `stopWeb` then looked at the new empty location and printed Stopped unconditionally. The operator had already identified and stopped the original supervisor/dev processes before implementation.

New sessions use a stable web cache/launchd namespace. Bounded legacy discovery reads only directories for the same checkout/dev key; stored canonical root and dev directory must agree, and a registered job must name Node, the web supervisor and the exact state-file argument. Foreign/malformed/symlinked records, active legacy locks, unknown inspection errors or multiple registrations refuse before arbitrary bootout. Health includes the checkout root, not only upstream/port. A live legacy lease stays at its original path; status reports its real log. Start stops a verified old registration before creating the stable one. Stop confirms job/PID disappearance and checks the owned overlay before removing state; absence and unconfirmed shutdown do not claim termination. Answering or occupied unverified services retain their record.

No generic manager or dependency was introduced. The registry's `launchctl` 1.1.1 is old (modified 2022-06-19) and has four direct native/legacy dependencies; it does not supply the ownership protocol. Existing Run and native filesystem/launchd primitives fit this domain boundary.

Validation: `pnpm typecheck`, `pnpm lint`, `pnpm compile`, `pnpm morpheus pm index`, `git diff --check`; focused `pnpm exec vitest run tests/qa-web-lifecycle.test.ts tests/qa-web-readiness.test.ts tests/qa-web.test.ts tests/qa-preview.test.ts` — 105 passed. Scope includes the changed web lifecycle, readiness consumers and shared iOS preview helpers. Two isolated cases run real test-owned web-supervisor/dev subprocesses and HTTP listeners through start, rename, status, legacy-to-stable restart and stop, asserting original/current PIDs and listener disappearance. Launchctl is simulated in those tests; only their fixture subprocesses receive signals. Other regressions cover different checkout keys, copied foreign state, wrong argv, ambiguity, malformed/symlinked/locked state, invalid PID, missing state, inspection/bootout failure, surviving registration and answering/unverified listeners.

Read-only platform verification inspected the already-stopped original launchd registration: it remained registered without a PID, and macOS printed exactly three arguments (node, web-supervisor.js, original legacy session.json), matching the parser. No bootout, signal, restart, browser navigation or other mutation was sent to that registration, any user preview/responder, website file, or installed CLI. No screenshots were taken: process/state ownership is validated by the lifecycle assertions, not rendered pixels.

Graph evidence is Tier 2, project Users-chrisheinrich-code-morpheus generation 2026-10-25T06:34:54Z. Exact webContext/stopWeb/dispatchWebPreview/launchPlist snippets established the old namespace and control path. Coverage of existing preview, CLI, readiness/test and runbook paths recorded no gap (best effort); worktree changes/new lifecycle test use direct source and execution. No graph-completeness claim is made.
