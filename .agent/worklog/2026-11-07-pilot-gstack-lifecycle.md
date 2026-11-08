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

## Open questions

The replays exercised discovery, routing, actual browser interaction and existing verification
fixtures. They did not measure whether a fresh model session follows the handoff without
reminders. Keep the pilot available for an interactive session before deciding on production
hooks, a machine-started monitor, or wider rollout. The next evidence is whether the session
picks and records useful gstack work at each applicable transition of a new task.
