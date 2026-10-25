# Which CI checks run

Morpheus selects expensive checks from the **complete pull-request diff**, not just
the last commit. PM and applicable PR conventions always retain their existing
behavior. An unlabelled draft still waits for review before reporting conventions.

| Changed input | Node | Browser QA | Claude bridge | Artifact ABI |
|---|---|---|---|---|
| Ordinary `docs/**/*.md`, `hq/**/*.md`, `qa/acceptance/**/*.md`, `.agent/worklog/**/*.md` | Skip | Skip | Skip | Skip |
| `src/**`, `dist/**`, general `tests/**` | Run | Skip | Skip | Skip |
| `src/qa/**`, `dist/qa/**`, `tests/browser/**` | Run | Run | Skip | Skip |
| `plugins/codex-claude/**` | Run | Skip | Run | Skip |
| `.github/actions/ios-testflight-upload/**`, `tests/artifacts/**` | Run | Run | Skip | Run |
| `tests/artifact-workflows.test.ts` | Run | Skip | Skip | Run |
| `docs/runbooks/**`, `docs/examples/**`, `.agents/**`, `.claude/**` | Run | Skip | Skip | Skip |
| Shared config, lockfiles, workflows, selector/tests, root Markdown, unknown paths | Run | Run | Run | Run |

More specific rows take precedence; mixed changes take the union. Runtime/test
Markdown is deliberately distinct from ordinary prose. Artifact changes also run
browser QA because failure traces use the artifact staging core. A dependency
closure test checks the actual repository imports of browser and bridge suites.
Adding a new input outside those imports still requires updating this table and
the selector. This is conservative path selection, not complete semantic analysis.

`scripts/ci-scope.mjs` reads the event's base/head commits from a full Git checkout,
finds their unique merge base, and consumes NUL-delimited paths with rename detection
disabled so old and new paths both count. It invokes Git without a shell. Missing
history, malformed events, ambiguity, truncation or an unclassified path runs all.
Only four explicit `false` outputs from a successful detector can skip checks;
a failed detector runs the dependent jobs. Cancelled workflows remain cancelled.
Every main push runs the full integration set, including docs-only merges.

The Node caller always invokes `node-ci.yml`; its new `run-check` boolean skips the
inner job. That preserves the required `node / check` result, which GitHub accepts
as skipped. Skipping the caller would leave that check unreported and block merge.
The reusable input defaults to true, so other projects keep their current behavior.
No workflow-level path filter or branch-protection setting changes.

## Why keep two Pythons but one upload

Python 3.9 covers the older interpreter boundary used by native macOS tooling;
3.14 covers newer filesystem and standard-library behavior. Both still run the
four artifact suites. They now share one runner and a ten-minute job deadline;
the loop attempts both versions even when one fails and returns failure afterward.

The transport fixture has fixed independently known bytes. Python versions do not
create two distinct Node upload ABIs, so after both compatibility passes, Python
3.14 stages it and the pinned Node 24 upload/download/readback runs **once**.
The two original runner/transport legs become one runner/transport leg. This is a
reduction in duplicated execution, not a measured wall-time or billing claim.
[Artifact snapshots](artifact-snapshots.md) documents the unchanged byte limits,
retention, pins and evidence limitations.
