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

## Resumed review clearance

The fresh measured review found CDH-002 (unattended executable discovery) and CDH-003 (source/runtime directory aliases). Both substantive findings were fixed and the same reviewer cleared d9d2fbbc0e827925161e1af29b53d8b3e520b6c4 after independently passing the two focused tests, including 59 generated-wrapper checks. The original session's incomplete timing audit remains preserved; no consumer activation or delivery was assessed.

The focused follow-up was measured with UTC clock readings 2026-10-20T02:46:52Z–2026-10-20T02:47:24Z (32,000 ms). Both findings retain their original substantive severity. The reviewed implementation commit is unchanged after clearance; only this audit worklog is finalized afterward.

```morpheus-review
{
  "version": 2,
  "base": "38c507d2790bc8a278b8134872f3a3cc7844d0e1",
  "reviewed": "7dfdbeb02755f9a3be410a006c242579fda6db68",
  "covered": "d9d2fbbc0e827925161e1af29b53d8b3e520b6c4",
  "authorSession": "01a15730-01ee-7f52-a39c-6c4bd5e9812d",
  "reviewerSession": "/root/morpheus_host/review_host",
  "risk": "normal",
  "elapsedMinutes": 1.85,
  "timing": {
    "source": "clock",
    "durationMs": 111000,
    "evidence": "Author clock readings around spawn_agent /root/morpheus_host/review_host initial invocation: 2026-10-20T02:43:42Z to final-answer receipt 2026-10-20T02:45:33Z."
  },
  "outcome": "complete",
  "summary": "The fresh measured review found CDH-002 (unattended executable discovery) and CDH-003 (source/runtime directory aliases). Both substantive findings were fixed and the same reviewer cleared d9d2fbbc0e827925161e1af29b53d8b3e520b6c4 after independently passing the two focused tests, including 59 generated-wrapper checks. The original session's incomplete timing audit remains preserved; no consumer activation or delivery was assessed.",
  "findings": [
    {
      "id": "CDH-002",
      "severity": "substantive",
      "description": "The wrappers inherited launchd's sparse PATH, so the real env-node CLI exited 127 and gh subprocess discovery was not established; the Bash fixture masked the failure.",
      "paths": [
        "src/cd/host/macos/cd-v2-common.sh.template",
        "docs/cd-v2-host-macos.md",
        "tests/cd/host-integration.sh",
        "tests/cd/host.test.ts"
      ],
      "disposition": "fixed",
      "response": "Rendered and guarded a reviewed absolute executable search path, tested actual Node and gh subprocess discovery from sparse inherited PATH, added a real built-CLI config/package-load smoke test and documented runtime/executor prerequisites. Same reviewer verified and cleared the fix at d9d2fbbc0e827925161e1af29b53d8b3e520b6c4."
    },
    {
      "id": "CDH-003",
      "severity": "substantive",
      "description": "String comparison let source paths alias the supposedly distinct trusted runtime directory through /., a trailing slash or a symlink.",
      "paths": [
        "src/cd/host/macos/cd-v2-common.sh.template",
        "tests/cd/host-integration.sh"
      ],
      "disposition": "fixed",
      "response": "Compare physical directory identities using cd -P and pwd -P; regressions reject all three alias shapes before credential-wrapper or controller invocation while distinct spaced paths succeed. Same reviewer verified and cleared the fix at d9d2fbbc0e827925161e1af29b53d8b3e520b6c4."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "/root/morpheus_host/review_host",
      "commit": "d9d2fbbc0e827925161e1af29b53d8b3e520b6c4",
      "outcome": "cleared",
      "elapsedMinutes": 0.5333333333333333,
      "timing": {
        "source": "clock",
        "durationMs": 32000,
        "evidence": "Author clock readings around followup_task /root/morpheus_host/review_host: 2026-10-20T02:46:52Z to final-answer receipt 2026-10-20T02:47:24Z."
      },
      "summary": "Verified CDH-002 and CDH-003 resolved; independently passed both host tests (59 generated-wrapper checks and real-runtime smoke), diff checks clean, no new findings or outstanding conditions."
    }
  ]
}
```
