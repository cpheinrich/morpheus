---
roadmap: MO-26-11-07-23.12.25
tags: [engineering, devops]
---

# Pilot gstack lifecycle integration

The pilot uses the host's installed skill entrypoints and one stage-to-workflow map in the
existing CLI. The session agent carries the opt-in and returns results to Morpheus's existing
worklog, review packet, or release owner. A general workflow engine would duplicate the task
state and introduce dispatch authority. The adapter needs only Node's argument and filesystem
APIs and the repository's existing frontmatter parser.

## Replay results

Installed gstack from `d479c5bf1efed979297dc4498c60aef7b67aa639` in a temporary Codex profile
using Bun 1.4.2 and `./setup --host codex --no-team --no-browser`. The real install showed that
Codex has `gstack-*` directories whose rendered frontmatter can use short names. Discovery and
the symlink regression test accept that layout. Codex app-server's model-free `skills/list`
confirmed all five mapped skills were enabled in the isolated profile. The browser executable
also needed Bun on PATH at run time, despite being compiled.

The review correction was exercised with a separate real Claude install. Short top-level
entries resolved as `review` and `qa-only`; relinking produced `gstack-review` and
`gstack-qa-only`. Disabling `qa-only` removed its entrypoint while the nested payload remained.
The compiled adapter returned the QA route as unavailable. The pilot reads installer-marked
Claude entrypoints; legacy or manually copied entries without that marker are outside its scope.

Ran the compiled adapter for four stages, both opt-in settings and three shipped Morpheus
tasks. All 24 results matched the expected route lists. Every off result was empty.

| Historical task | What the adapter offered | Evidence from the replay |
| --- | --- | --- |
| MO-26-10-24-20.37.28, web QA pin placement | Autoplan, review + QA-only, verify, and a web canary candidate | Ran the installed gstack browse helper against the existing localhost overlay and captured distinct Alice and Bob dialog states. The existing acceptance fixture passed in Chromium and WebKit. A canary would require a separate real release target. |
| MO-26-10-28-14.09.01, wait-ci and polling | Autoplan, review + QA-only, verify | The existing run and poll guard tests exercised the CLI without a live provider. Monitoring routes back to Morpheus wait-ci. |
| MO-26-10-30-15.16.58, iOS simulator retry | Autoplan, review, verify | The existing retry tests covered simulator erase, failed-test selection and flaky classification using fixtures. There was no browser or canary route. A live iOS run still needs the project's simulator/Xcode lane. |

Ran the gstack verification helper's read-only `gstack-checks detect` against the pilot checkout.
It found pnpm typecheck and lint, advertised pregate selection, and reported the checkout as
untrusted. A focused `gstack-checks run --only typecheck --allow-repo-commands --timeout 45`
then returned `CHECK typecheck PASS 6.1s`. The rest of the checks ran via Morpheus's prescribed
commands. No gstack release workflow or live monitor ran.

## Validation

- `pnpm typecheck`
- `pnpm exec vitest run tests/gstack-lifecycle.test.ts tests/project-skills.test.ts` (18 passed)
- `pnpm exec vitest run tests/ios-test-retry.test.ts tests/wait-ci/wait-run.test.ts tests/wait-ci/poll-guard.test.ts tests/qa-comments.test.ts` (177 passed)
- `pnpm exec playwright test tests/browser/qa-web-context.spec.ts -g 'exact semantic state' --workers=1` (two browsers passed)
- `pnpm compile`, `pnpm morpheus pm index`, `morpheus complexity check`, and `git diff --check`

## Managed install

Pin the published gstack release `v1.97.0.0` to commit
`e75a69c9e15164d090e080fa001dc515495ec350`. Use the upstream host installer with a
private profile and cached Bun. The lifecycle adapter is the sole caller and the
ordinary path skips discovery. No package dependency, user hook or new scheduler is
needed. A package or lock library would add overhead to a local installation that
can publish a ready receipt with one filesystem operation.

Real cold installs from the GitHub tag succeeded for Codex and Claude, and warm
lookups reused the same paths. Both private profiles had update checks and telemetry
off. The managed browser read the expected title from a loopback fixture. The
literal Claude verify preamble ran using the returned environment with an unrelated
caller home. The default-off and moved-tag regression tests used local fakes and
asserted that setup was not invoked. The 37 lifecycle, project-skill, and agent
instructions tests passed, along with typecheck, compile, roadmap index, complexity,
and diff checks. The startup instruction stays under the existing byte limit.

The open experiment is whether an interactive session chooses useful gstack handoffs
through a real task. The adapter is ready for that opt-in use.

## Independent review

Independent review verified the Claude launcher correction and identified a separate issue with Claude helper paths under the managed install. Both findings met the reviewer’s conditions. The managed HOME reached the literal Claude preamble, and focused checks passed with the shorter opt-in instruction.

```morpheus-review
{
  "version": 2,
  "base": "ab9785ea401f14909a1bd16c09b7d025a97a4a29",
  "reviewed": "26890248c61ca155e78aa9a2cb02da15828daef6",
  "covered": "3ef8aef49c1ffc9d3d32b317a9c68461ef79e1fc",
  "authorSession": "01a1b9eb-8cea-7402-8459-9a9dbda63a89",
  "reviewerSession": "/root/gstack_pilot_review",
  "risk": "normal",
  "elapsedMinutes": 1.7,
  "timing": {
    "source": "clock",
    "durationMs": 102000,
    "evidence": "UTC clock before spawning the independent review at 2026-11-08T07:19:24Z and actual UTC completion reported by the reviewer at 2026-11-08T07:21:06Z."
  },
  "outcome": "complete",
  "summary": "Independent review verified the Claude launcher correction and identified a separate issue with Claude helper paths under the managed install. Both findings met the reviewer’s conditions. The managed HOME reached the literal Claude preamble, and focused checks passed with the shorter opt-in instruction.",
  "findings": [
    {
      "id": "GSTACK-1",
      "severity": "substantive",
      "description": "Claude discovery misses the pinned installer’s default flat entrypoint and reports nested payload files as installed even when a skill is disabled.",
      "paths": [
        "src/cli/gstack-lifecycle.ts"
      ],
      "disposition": "fixed",
      "response": "Use the top-level short or prefixed Claude launcher and require the installer marker. Report its invocable name and never fall back to the nested payload.",
      "condition": {
        "paths": [
          "src/cli/gstack-lifecycle.ts",
          "dist/cli/gstack-lifecycle.d.ts",
          "dist/cli/gstack-lifecycle.js",
          "dist/cli/gstack-lifecycle.js.map",
          "tests/gstack-lifecycle.test.ts",
          "docs/runbooks/gstack-lifecycle.md",
          ".agent/worklog/2026-11-07-pilot-gstack-lifecycle.md"
        ],
        "evidence": "Require gstack provenance and document unsupported layouts. Pass focused lifecycle and project-skill tests, typecheck and compile. Verify executable discovery with a real isolated Claude install, and regress short and prefixed, payload-only and foreign, Codex and default-off routing."
      },
      "conditionMet": "Typecheck, compile and 18 lifecycle/project-skill tests passed. The executable resolved the real isolated flat and prefixed Claude launchers and returned unavailable after disabling QA-only while its payload remained. Tests also cover unrelated short names, Codex and default-off."
    },
    {
      "id": "GSTACK-2",
      "turn": 2,
      "severity": "substantive",
      "description": "Claude playbooks resolve helper and supporting file references through the caller home without a managed HOME.",
      "paths": [
        "src/cli/gstack-install.ts"
      ],
      "disposition": "fixed",
      "response": "Expose the private HOME in the returned environment and document scoped shell and file resolution. Keep the opt-in pointer within the startup context budget.",
      "condition": {
        "paths": [
          "src/cli/gstack-install.ts",
          "src/cli/gstack-lifecycle.ts",
          "tests/gstack-lifecycle.test.ts",
          "docs/runbooks/gstack-lifecycle.md",
          "AGENTS.md",
          ".agent/worklog/2026-11-07-pilot-gstack-lifecycle.md",
          "dist/cli/gstack-install.js",
          "dist/cli/gstack-install.js.map",
          "dist/cli/gstack-install.d.ts",
          "dist/cli/gstack-lifecycle.js",
          "dist/cli/gstack-lifecycle.js.map",
          "dist/cli/gstack-lifecycle.d.ts"
        ],
        "evidence": "Run the literal preamble from the returned Claude skill with the emitted runtime and an unrelated caller home. Pass focused lifecycle, project-skill, and agent-instructions tests, typecheck and compile. Keep AGENTS edits limited to the pilot pointer and adjacent intake wording, preserving its rules."
      },
      "conditionMet": "The literal Claude verify preamble ran with the managed HOME from an unrelated caller home and reported UPDATE_CHECK false. All 37 focused tests, typecheck and compile passed. AGENTS.md is 19,944 bytes and the intake rules remain in the adjacent paragraph."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "/root/gstack_pilot_review",
      "commit": "9cfcfaa821ad2ff6d1454427d8c9ca7a30f67c5e",
      "base": "80717b63522050e265b95eee73abe16d58787246",
      "scopeReason": "The user requested managed release installation and removal before merging this opt-in integration. Installation is inseparable from the PR acceptance. The turn covers that expansion and the exact trunk merge.",
      "outcome": "cleared",
      "summary": "Conditionally cleared the managed release adapter with a scoped HOME fix for the literal Claude skill preamble. No other findings.",
      "elapsedMinutes": 1.2666666666666666,
      "timing": {
        "source": "clock",
        "durationMs": 76000,
        "evidence": "Author UTC clock before requesting the follow-up at 2026-11-08T07:37:07Z and actual UTC completion reported by the reviewer at 2026-11-08T07:38:23Z."
      }
    }
  ]
}
```
