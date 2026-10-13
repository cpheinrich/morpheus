---
date: 2026-10-06
agent: claude
roadmap: MO-26-10-06-15.17.01
outcome: shipped
summary: The iOS QA preview moves from Evo into `morpheus qa preview ios`; the overlay starts with it and every agent opens the same page; `morpheus qa guide` and a `comment-qa` skill.
---

# MO-26-10-06-15.17.01 — Shared comment QA

Chris asked (2026-10-06) for every agent — Claude, Codex, Grok — to do the same thing for QA, with
Grok opening the default browser because it has no panel, and for Evo's preview lifecycle to come
out now because he wants to QA the Lakina iOS app.

## What moved, what stayed

- **Moved from Evo** (`apps/ios/scripts/preview.mjs`, `preview-supervisor.mjs`, `preview-tools/`):
  argument parsing, runtime selection, the per-checkout key, launchd plist and supervisor, the
  four-hour lease, ownership-checked shutdown, the start lock and signal-as-intent cancellation,
  the Xcode 27 input repair, port refusal, the tunnel. Every Evo test of these is ported to
  `tests/qa-preview.test.ts` (33 tests with the new ones).
- **Stays per project**, in `morpheus.json` `qa.ios`: build command, product, DerivedData, bundle id,
  device name, namespace, minimum Xcode, and launch modes. A mode may name a `prepare` command whose
  stdout is `{"env": {...}}`, run under `morpheus credentials run` when it says so; Evo's staging QA
  account helper is the first.
- **New**: the supervisor starts the comment overlay itself once serve-sim is up, so one lease and
  one `stop` end both (before, the overlay was a second process agents forgot). `morpheus qa guide`
  prints the agent's instructions from the installed CLI; the `comment-qa` skill points at it and
  `init` writes it to `.agents/skills` and `.claude/skills` from one template.

## Choices

- **One surface.** The overlay URL in Claude's Browser pane, Codex's browser panel, or `open <url>`.
  Evo's 2026-09-30 reason for Claude's native Simulator panel was that agent clicks on serve-sim's
  own page in the Browser pane did not reach the app; the overlay forwards touches server-side, and
  that works (checked again today on both apps).
- **Evo's identity preserved.** The checkout key is computed exactly as before and Evo declares
  `namespace: med.evo.preview` and `device.name: Evo QA`, so previews other sessions had running
  (two were, during this work) stay addressable by `stop`; neither was touched.
- **serve-sim as a CLI dependency** (pinned 0.1.47, three small dependencies) rather than a
  per-project `npm ci`; its exports hide the CLI file, which is found beside the exported
  `middleware` entry.
- **Default ports spread per checkout** (3200–3455, overlay +256). Evo's fixed 3200 default would
  make the second project's preview refuse to start.
- **Flags.** The global parser consumes `--help`, `--name`, `--kind` and others before a subcommand
  runs; config refuses those as mode flags, and per-project help is the word `help`.
- **Dead end:** `--help` on `qa preview ios` printed the global help, found only by running it.

## Verified on real simulators (Xcode 27.0, iOS 27.0, this Mac)

| Check | Lakina | Evo |
|---|---|---|
| doctor / help lists the project's modes | yes | yes, through `preview.sh --help` |
| start builds this checkout and comes up healthy | demo | demo, then live with `--no-build` |
| real app frame in the overlay (Claude Browser pane) | yes | yes |
| a click reaches the app | yes, first try | first tap dropped while demo data loaded, next three landed |
| right-click pin + ⌘Enter writes a batch with a real-pixel frame at device resolution, anchor on target | yes | yes |
| pending / show / resolve | yes | yes |
| live mode signed in through the prepare hook | not applicable (needs Google sign-in) | yes: QA account's onboarded 2,258 kcal target |
| stop ends simulator and overlay, nothing else | — | yes; Lakina and two other sessions' Evo previews kept running |
| four previews side by side | yes | yes |

Found by running, fixed: `status` called a working preview unhealthy because serve-sim's first
response after idle took over 2 s (measured 545 ms to >2 s); the probe now waits 5 s, releases the
body, and `status` retries twice.

Not verified here: Codex's browser panel and Grok's `open` path (no Codex or Grok session on this
Mac in this work); the tunnel command is unit-tested, not run across two Macs.

## Validation

`pnpm typecheck`; `pnpm test` 60 files / 1,656 tests before the ported lifecycle tests, all green
after; `pnpm compile` refreshes `dist/`.

## Independent review

PR cpheinrich/morpheus#332. A fresh reviewer at normal-leaning-high risk compared the code against Evo's preview.mjs, supervisor and tests, ran the focused suites, typecheck and lint, confirmed dist matches a fresh compile, and checked the checkout key, Evo's identity, the credential handoff, legacy previews, the health probe, shutdown safety, serve-sim resolution under a global install, the overlay root, the guide, the skill and init. Two substantive findings, both cleared conditionally and fixed under their conditions: mode flags were not refused when the global parser would swallow them, so a declared flag such as --offline could silently launch the default (for Evo, credentialed live) mode — RESERVED_FLAGS is now built from the parser's own tables; and the credential path Evo's tests pinned was not pinned again — the prepare step is now an exported function tested for the credentials prefix, cwd, piped stdio, key expansion and an error that never carries the command's output. Five minors fixed (stop no longer needs serve-sim; supervisor ownership bound to its own checkout key; a stop during startup aborts the stream wait; health requires the overlay to name this preview as upstream; help ordering) and one incidental fixed (namespace refuses '..'). The fixed supervisor and health check were re-run on a real simulator: a preview the old supervisor started was stopped, a new one started and reported healthy. Cleared.

```morpheus-review
{
  "version": 2,
  "base": "f1d416e4c32e9a8e33f15d7358a0f8588c23d0a4",
  "reviewed": "cd99305d009fb0b9a262d40bc4f4ee0dd7e8b9b3",
  "covered": "64d7437e613371e9576bcf2ddad283505c346c14",
  "authorSession": "f963f54d-05ca-4439-8ec1-1dedd1e49e13",
  "reviewerSession": "a9f7189cb018351b2",
  "risk": "normal",
  "elapsedMinutes": 5.113583333333333,
  "timing": {
    "source": "runner",
    "durationMs": 306815,
    "evidence": "Agent tool task-notification usage.duration_ms=306815 for reviewer agent a9f7189cb018351b2 (initial review, started 2026-10-06 23:33 UTC from author session f963f54d-05ca-4439-8ec1-1dedd1e49e13); reviewer clock readings 23:33:00 to 23:37:21 UTC."
  },
  "outcome": "complete",
  "summary": "A fresh reviewer at normal-leaning-high risk compared the code against Evo's preview.mjs, supervisor and tests, ran the focused suites, typecheck and lint, confirmed dist matches a fresh compile, and checked the checkout key, Evo's identity, the credential handoff, legacy previews, the health probe, shutdown safety, serve-sim resolution under a global install, the overlay root, the guide, the skill and init. Two substantive findings, both cleared conditionally and fixed under their conditions: mode flags were not refused when the global parser would swallow them, so a declared flag such as --offline could silently launch the default (for Evo, credentialed live) mode — RESERVED_FLAGS is now built from the parser's own tables; and the credential path Evo's tests pinned was not pinned again — the prepare step is now an exported function tested for the credentials prefix, cwd, piped stdio, key expansion and an error that never carries the command's output. Five minors fixed (stop no longer needs serve-sim; supervisor ownership bound to its own checkout key; a stop during startup aborts the stream wait; health requires the overlay to name this preview as upstream; help ordering) and one incidental fixed (namespace refuses '..'). The fixed supervisor and health check were re-run on a real simulator: a preview the old supervisor started was stopped, a new one started and reported healthy. Cleared.",
  "followUps": [
    {
      "reviewerSession": "a9f7189cb018351b2",
      "commit": "64d7437e613371e9576bcf2ddad283505c346c14",
      "scopeReason": "The fix commit also regenerated the committed dist/ for the changed sources (dist/cli/args.*, dist/cli/help.*, dist/qa/preview/config.*, ios.*, supervisor.*), which the reviewer's conditions did not name; the checker required explicit coverage, so the same reviewer reviewed cd99305d..64d7437e.",
      "outcome": "cleared",
      "elapsedMinutes": 0.92231666666666667,
      "timing": {
        "source": "runner",
        "durationMs": 55339,
        "evidence": "Agent tool task-notification usage.duration_ms=55339 for the follow-up turn of reviewer agent a9f7189cb018351b2; reviewer clock readings 23:51:59 to 23:52:35 UTC."
      },
      "summary": "Same reviewer, follow-up turn on the fix commit, which also regenerated dist/ for the changed sources: every finding resolved as asked (SUB-1 RESERVED_FLAGS now built from the global parser's own tables, so a later global flag is reserved automatically; SUB-2 the prepare step exported and pinned for prefix, argv, cwd, piped stdio, expansion and a token-free error); the minors and the incidental resolved; dist/ equal to a fresh pnpm compile of src at the fix commit; focused tests 112/112, typecheck and lint clean. No new findings. Cleared."
    }
  ],
  "findings": [
    {
      "id": "SUB-001-mode-flags-swallowed-by-global-parser",
      "severity": "substantive",
      "disposition": "fixed",
      "paths": ["src/cli/args.ts", "src/qa/preview/config.ts", "tests/qa-preview.test.ts"],
      "description": "RESERVED_FLAGS listed only some of the flags the global parser consumes, so a mode could declare one (--offline, --account, ...) that never reached the preview: the default mode, possibly the credentialed live one, would launch instead with no error.",
      "response": "args.ts exports globalFlags() built from its stringOptions, booleanOptions and switch flags; RESERVED_FLAGS is that set plus the preview's own flags. Tests assert every global flag is reserved, list the switch-handled ones explicitly, and refuse --offline as a mode flag.",
      "condition": {
        "paths": ["src/cli/args.ts", "src/qa/preview/config.ts", "tests/qa-preview.test.ts"],
        "evidence": "npx vitest run tests/qa-preview.test.ts and pnpm typecheck."
      },
      "conditionMet": "On 64d7437e: npx vitest run tests/qa-preview.test.ts passed 38 tests including the new reserved-flag test; pnpm typecheck clean; the full suite passed 60 files / 1670 tests."
    },
    {
      "id": "SUB-002-credential-path-not-pinned",
      "severity": "substantive",
      "disposition": "fixed",
      "paths": ["src/qa/preview/ios.ts", "tests/qa-preview.test.ts"],
      "description": "Evo pinned that the live prepare runs under morpheus credentials run --, in the checkout, with piped stdio; nothing here pinned the prefix, cwd, stdio, key expansion or that a failure's message carries no output.",
      "response": "The prepare step is exported as prepareLaunchEnvironment and runPreview calls it; tests assert the argv prefix, cwd, stdio pipe, {key} and {root} expansion, that a mode without prepare runs nothing, and that neither a throwing command nor bad JSON puts a fake token into the error.",
      "condition": {
        "paths": ["src/qa/preview/ios.ts", "tests/qa-preview.test.ts"],
        "evidence": "The focused vitest run and pnpm typecheck."
      },
      "conditionMet": "On 64d7437e: npx vitest run tests/qa-preview.test.ts passed 38 tests including four credential-path tests; pnpm typecheck clean."
    },
    {
      "id": "MIN-001-stop-needs-serve-sim",
      "severity": "minor",
      "disposition": "fixed",
      "paths": ["src/qa/preview/ios.ts"],
      "description": "serveSimCli() ran before the stop branch, so a broken serve-sim install made stop fail and left the preview up until its lease ended.",
      "response": "serve-sim is resolved only for doctor and start."
    },
    {
      "id": "MIN-002-supervisor-ownership-from-state",
      "severity": "minor",
      "disposition": "fixed",
      "paths": ["src/qa/preview/supervisor.ts"],
      "description": "The supervisor accepted any '<name> <12 hex>' device named in its state file.",
      "response": "The device name must end in the job's own checkout key, the state directory's name. Re-run on a real simulator: start under the new supervisor came up healthy."
    },
    {
      "id": "MIN-003-stop-during-startup-delayed",
      "severity": "minor",
      "disposition": "fixed",
      "paths": ["src/qa/preview/supervisor.ts"],
      "description": "Cleanup awaited the stream wait, which kept polling after serve-sim was killed, so a stop during startup could take twenty seconds or more.",
      "response": "Cleanup marks the supervisor stopping and the wait returns at its next poll."
    },
    {
      "id": "MIN-004-stray-overlay-reported-as-ours",
      "severity": "minor",
      "disposition": "fixed",
      "paths": ["src/qa/preview/ios.ts"],
      "description": "Health accepted any 200 from /health on the overlay port, so a standalone overlay bound there during a long build could be reported as this preview's.",
      "response": "Health requires /health's previewUrl to equal this preview's stream URL. Re-run on a real simulator: status reported the new preview healthy."
    },
    {
      "id": "MIN-005-help-ordering",
      "severity": "minor",
      "disposition": "fixed",
      "paths": ["src/cli/help.ts"],
      "description": "The new lines separated qa comments serve from its description.",
      "response": "The new lines follow the serve description."
    },
    {
      "id": "INC-001-namespace-dotdot",
      "severity": "incidental",
      "disposition": "fixed",
      "paths": ["src/qa/preview/config.ts"],
      "description": "The namespace regex accepted '..'.",
      "response": "Refused, tested."
    }
  ]
}
```

Follow-up turn on the fix commit: Same reviewer, follow-up turn on the fix commit, which also regenerated dist/ for the changed sources: every finding resolved as asked (SUB-1 RESERVED_FLAGS now built from the global parser's own tables, so a later global flag is reserved automatically; SUB-2 the prepare step exported and pinned for prefix, argv, cwd, piped stdio, expansion and a token-free error); the minors and the incidental resolved; dist/ equal to a fresh pnpm compile of src at the fix commit; focused tests 112/112, typecheck and lint clean. No new findings. Cleared.
