---
roadmap: MO-26-10-19-19.10.42
---

# Add reviewed macOS host integration for CD V2

## Discovery

The CD V2 design, controller, workflow adapters and exact immutable control-tag upload guard are already merged in Morpheus PRs #415–#418. Evo PR #553 already carries the observation-mode consumer integration and its private campaign record. No open Morpheus PR covers local host supervision.

The recovery session had a separate local prototype under `MorpheusCD/public-host-preparation`. It fixed the actual published CLI path, explicit `cd tick|worker` grammar, `--source-dir`, child-only credential loading, recurring worker wakeup and several template guards. Its synthetic generated-wrapper suite reports 41 passes. The earlier local rendered host files had not been loaded; the corrected generic templates also had not been installed.

This work brings only the project-agnostic macOS wiring and its synthetic validation into the Morpheus repository. It does not carry Evo's paths, credentials, private RCA, ledger state or protected-environment settings.

## Implementation

Added source templates for a shared guarded shell, separate tick and local-worker entrypoints, and two five-minute launchd jobs. Added a generated-wrapper integration test using spaced temporary paths and synthetic credentials, a Vitest entrypoint, and a runbook that covers observe-first setup, actual host prerequisites, and exact-label rollback. Linked the host assets from the CD package README and controller guide.

The templates intentionally remain reviewed source assets copied from an exact Morpheus commit. No CLI installer, state initialization, launchctl invocation, consumer credential mapping, automatic activation, legacy drain, or TestFlight assertion is provided. A future need for two independently managed consumers may justify a renderer command; this change keeps the first consumer path small and explicit.

## Verification

- `node_modules/.bin/vitest run tests/cd/host.test.ts --configLoader runner` — 1 test passed. The runner mode avoids Vite's config-temp write into the shared node_modules symlink.
- `bash tests/cd/host-integration.sh` — PASS=41 FAIL=0, covering generated wrappers, command arguments, credential isolation, digest/path refusals, launchd intervals and shell syntax.
- `node_modules/.bin/tsc --noEmit` — passed.
- `node_modules/.bin/tsc -p tsconfig.build.json` — passed.
- `bash -n src/cd/host/macos/*.sh.template` and `plutil -lint src/cd/host/macos/*.plist.template` — passed.
- `node dist/cli/index.js pm index --dir hq/product` — indexes unchanged after generation.
- `git diff --check` — passed.
- `morpheus check pr` — code conventions passed; it correctly reported that the PR body, `review` roadmap status and independent review label are pending PR creation/review. Focused commands were selected because this adds isolated host templates and docs; the CD host test covers generated execution and the TypeScript check/build validate repository integration.

## Independent review — original session

A fresh reviewer (`/root/review_morpheus_cd_host`) reviewed `8a2486efabe54deb17bb0bab1f43e8c78c286309` at normal risk and found substantive issue CDH-001 in `tests/cd/host-integration.sh`: BSD-only `sed -i ''` and Apple `plutil` made the default Vitest suite fail on Morpheus's Ubuntu CI. The author fixed this in `a99e991072c30ab3b7e4208b7f7c419e46522667` using portable POSIX `sed` with a temp-file replacement preserving executable mode, and Python stdlib `plistlib`. Focused Vitest (1 test), all 41 synthetic wrapper checks, shell syntax and diff check pass. The same reviewer cleared CDH-001 at that exact head. Reviewer follow-up timing: 8,000 ms from UTC clock readings 2026-10-20T02:18:48Z–2026-10-20T02:18:56Z.

The review cannot be recorded as complete: no runner duration metadata or start/end clock readings were captured for the initial turn. The reviewer confirmed this during the finalization-only turn and declined to estimate. Morpheus's contract requires measured timing for every turn; therefore the independent-review record is incomplete, `agent-reviewed` must stay absent, and the PR remains a draft. Do not infer clearance for merge from the follow-up's cleared finding.

No consumer host has loaded these templates; installation and delivery cutover remain consumer-owned.

## Resumed review and fixes

Chris explicitly asked the continuation session to finish the original CTO-authorized campaign, including its instruction permitting as many independent code reviews as needed. The original review session is unavailable and its unmeasured initial turn remains incomplete above; no historical timing was inferred or backfilled. This authorization permits the fresh measured review cycle below while preserving the earlier finding and limitation.

The fresh reviewer `/root/morpheus_host/review_host` reviewed `7dfdbeb02755f9a3be410a006c242579fda6db68` at normal risk. The initial invocation was measured with UTC clock readings 2026-10-20T02:43:42Z–2026-10-20T02:45:33Z (111,000 ms). It found two substantive defects and returned blocked:

- CDH-002: launchd's sparse inherited PATH cannot resolve the real Node CLI or its `gh` subprocess. The existing Bash fixture concealed this. Added a rendered executable search path with absolute-directory guards and Node/gh/Git availability probes; documented Node 22+, locked runtime dependencies and repair-executor prerequisites. The fixture now executes actual Node JavaScript and a synthetic `gh` subprocess with a sparse inherited PATH. A separate no-network real `dist/cli/index.js cd config` test verifies actual package loading.
- CDH-003: string comparison allowed `runtime/.`, trailing-slash and symlink aliases to pass the distinct-checkout guard. Compare physical directory identities and assert all three alias shapes fail before the credential wrapper or controller runs.

Verification after these fixes: `pnpm exec vitest run tests/cd/host.test.ts` passed 2 tests, including 59 generated-wrapper checks and the real-runtime smoke test. `pnpm typecheck`, `pnpm compile`, `pnpm morpheus pm index` and `git diff --check` passed; generated outputs and indexes were unchanged. Scope remains isolated host integration, so the focused host suite is appropriate and the full suite remains CI-owned. No launchd job, provider state or consumer credential was changed.
