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
