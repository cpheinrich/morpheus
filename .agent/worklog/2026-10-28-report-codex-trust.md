---
date: 2026-10-28
agent: claude
roadmap: MO-26-10-28-17.16.16
outcome: review
tags: [engineering]
summary: morpheus doctor reads ~/.codex/config.toml read-only and names every Codex hook that will not run yet, with where to trust it; Codex's trust key and hash are reproduced from its source and pinned to hashes Codex computed, and a worktree is reported against the main checkout's hooks, which is what Codex runs there.
---

# Doctor reports which Codex hooks still need trust

## Why

The read hook (#547) and the poll guard (#545) are wired into every project's `.codex/hooks.json`,
but Codex runs a repository hook only after the user trusts it with `/hooks`, and says nothing when
it declines. On this machine Morpheus and Kairos had no trusted Codex hooks at all, and Lakina's one
trusted hook had been trusted as `morpheus context brief` and silently stopped running when the file
changed to the session shim. No command reported any of it.

## What changed

- `src/doctor/codex-trust.ts`: reads the `.codex/hooks.json` Codex actually runs for a checkout,
  reproduces each hook's trust key and hash, reads `hooks.state` and `projects` from
  `$CODEX_HOME/config.toml` (default `~/.codex`), and classifies each hook as trusted, modified
  (stale hash), untrusted, disabled or unverified. Never writes Codex's config.
- `doctor` adds `codex-trust` warnings: the untrusted and stale hooks by name with "Open Codex in
  `<main checkout>` and run /hooks; trust: …", an untrusted project, switched-off hooks, hooks it
  cannot verify, and, in a linked worktree, that Codex runs the main checkout's file and whether this
  worktree's differs. Silent when everything Codex reads is trusted, and when there is no Codex home.
- `context install`'s Codex note now says to trust in the main checkout and points at `doctor`.
- `docs/runbooks/context-freshness.md`: how Codex hook trust works, and a proposed user-level,
  trust-once-per-machine design (filed as MO-26-10-28-17.23.16, not built).
- `smol-toml` 1.9.1 added as a runtime dependency.

## How Codex trust was established

From Codex's source at `rust-v0.163.0` (installed when this started), `rust-v0.164.0-alpha.11.1`
(bundled in the ChatGPT desktop app) and `rust-v0.165.0` (the CLI auto-updated mid-task); the
relevant functions are identical across the three:

- key: `hooks::hook_key` — `<source path>:<event label>:<group>:<handler>`, source path being the
  hooks file's absolute path;
- hash: `discovery::hook_hash` → `fingerprint::version_for_toml` — sha256 of compact, key-sorted JSON
  of `{event_name, matcher?, hooks: [normalized handler]}`, where normalization fills the timeout
  (600 s, or 1 s clamped to 3 s for SessionEnd/Interrupt), keeps `async` and `statusMessage`, drops
  `commandWindows`, drops `additionalContextLimit` when it is 2,500 or the event cannot emit context,
  and drops the matcher for UserPromptSubmit/Stop/Interrupt;
- worktrees: `loader::root_checkout_hooks_folder_for_dir` points a linked worktree's hook discovery
  at the main checkout's `.codex/`.

Before writing code, a Python reimplementation reproduced the three `trusted_hash` values already
in the real config (Evo/MacLock session shim, Evo `morpheus credentials status`, Lakina's old
`morpheus context brief`).

## Verification

- **Against Codex itself.** `codex app-server` (0.165.0) `hooks/list`, read-only (only `initialize`
  and `hooks/list` were sent), for `~/code/{evo,lakina,morpheus,kairos}` and two linked worktrees:
  Evo trusted ×2; Lakina session shim *modified* and credentials status *untrusted*; Morpheus three
  untrusted; Kairos one untrusted; each worktree listed its **main checkout's** hooks under the main
  checkout's key. The new `doctor` reported exactly the same sets in all five places.
- **Normalization against Codex.** An isolated `CODEX_HOME` and scratch tree (nothing under
  `~/.codex` touched) holding a hooks.json with every normalization edge; `hooks/list` gave ten
  hashes, now pinned in `tests/doctor-codex-trust.test.ts` with the five real ones above. The same
  probe showed a parent directory's `.codex/hooks.json` is not loaded for a repository beneath it,
  and that user-level `config.toml` and `hooks.json` hooks load everywhere (with a "prefer a single
  representation" warning when both exist).
- **Mutation check.** Fifteen single-line mutants of `codex-trust.ts` (each default, clamp, matcher
  rule, key sort, Windows command, trusted-vs-modified, disabled precedence, project-trust order,
  main-checkout resolution, worktree diff, unusable config); the new test file killed all fifteen.
- `pnpm typecheck`, `pnpm compile`; focused `doctor-codex-trust`, `doctor`, `doctor-instructions`,
  `session-install` — 75 passed. Full `pnpm test` once: 3,820 passed, 6 failed, all six in
  `tests/workflow-expressions.test.ts` because `actionlint` is not installed on this machine (CI
  installs it).
- `smol-toml` parses the real `~/.codex/config.toml` (20 `hooks.state` entries).

## Decisions made without asking

- **`smol-toml` over a hand reader and over `hooks/list`.** Recorded in `decisions.md`.
- **Warnings, not errors.** An untrusted hook does not break the repository; it is a device action
  for the person, like codebase-memory.
- **Project trust is reported** because an untrusted project loads no project hooks at all, which
  would otherwise read as "every hook untrusted".
- **The user-level design is documented and filed, not built**, because it writes the user's live
  Codex config; Chris (or a session he directs) runs it.

## Dead ends

- Brute-forcing the hash from guessed JSON shapes (99 candidates) found nothing; the default
  `timeout: 600` and `async: false` added during normalization were the missing fields, and only the
  source showed them.

## Review

One fresh reviewer subagent (runner id `aefa5cd9a75d5b377`, no inherited history) reviewed
`74d3b90c..8583a015` at normal risk: a read-only diagnostic that writes no configuration. The
runner measured 7.66 minutes. It checked the key, hash, normalization, enablement, project-layer,
worktree and project-trust logic against Codex's source at `rust-v0.165.0`, then ran Codex's own
`hooks/list` beside the committed `dist/` report over a scratch copy of the real config for
`~/code/{morpheus,evo,lakina,kairos}` and this worktree: keys, hashes and trust states were
identical. Focused tests passed (50), `tsc --noEmit` was clean, and `dist/` matched a fresh compile.
It cleared the change with two minor findings, both fixed by the author in `ad3bc055` without a
follow-up turn:

- **R-1.** A linked worktree whose own `.codex/hooks.json` carries hooks while the main checkout has
  none returned `no-hooks` silently, though Codex runs none of them there. It now reports that, with
  a test for wired, empty and absent worktree files. In the same function, per the reviewer's
  observation, the Codex home is read before the hooks file, so a machine without Codex reports
  nothing even when the file is broken.
- **R-2.** Trust keys were built from Git's symlink-resolved paths while Codex keys by the path it
  was opened with, so trust recorded through a symlinked checkout would read as untrusted. Hook
  state and project trust recorded under another spelling that resolves to the same file now count
  (preferring an entry that records trust); the runbook says so; a symlink test covers trusted and
  stale aliases.

After the fixes: five further mutants (alias lookup, project alias, the worktree no-hooks report,
state-before-file ordering, the empty-file guard) were all killed alongside the original fifteen;
focused `doctor-codex-trust`, `doctor`, `doctor-instructions` and `session-install` gave 77 passed;
`pnpm typecheck` and `pnpm compile` were clean; `doctor` in the four main checkouts still reports
the same hooks as Codex's `hooks/list`.

Normal-risk review cleared with no substantive findings. Minor R-1 (a worktree whose hooks the main checkout lacks was reported as having none) and R-2 (trust recorded under a symlinked spelling of the checkout read as untrusted) were fixed by the author in ad3bc055.

```morpheus-review
{
  "version": 2,
  "base": "74d3b90ca007ca45380b73243c0d5c2b70e423a8",
  "reviewed": "8583a015f0e2a51aa931f2de0b1c2c54e60f384a",
  "covered": "ad3bc055221cf7df8220e8d2634b15af20fd588f",
  "authorSession": "0d17f3e2-e23e-440f-949e-057495fe4e55",
  "reviewerSession": "aefa5cd9a75d5b377",
  "risk": "normal",
  "elapsedMinutes": 7.658483333333334,
  "timing": {
    "source": "runner",
    "durationMs": 459509,
    "evidence": "Claude Code Agent tool result for reviewer agentId aefa5cd9a75d5b377 (initial turn): usage duration_ms=459509."
  },
  "outcome": "complete",
  "summary": "Normal-risk review cleared with no substantive findings. Minor R-1 (a worktree whose hooks the main checkout lacks was reported as having none) and R-2 (trust recorded under a symlinked spelling of the checkout read as untrusted) were fixed by the author in ad3bc055.",
  "findings": [
    {
      "id": "R-1",
      "severity": "minor",
      "description": "In a linked worktree whose own .codex/hooks.json has hooks while the main checkout has no hooks.json, codexTrustReport returned no-hooks and doctor said nothing, although Codex runs none of those hooks there.",
      "paths": [
        "src/doctor/codex-trust.ts",
        "dist/doctor/codex-trust.js",
        "dist/doctor/codex-trust.js.map",
        "tests/doctor-codex-trust.test.ts"
      ],
      "disposition": "fixed",
      "response": "A no-hooks report now carries worktreeDiffers when the worktree's own file lists at least one hook, and codexTrustFindings names it: Codex runs none of these hooks until they merge and the main checkout is fast-forwarded. Tests cover a wired, an empty and an absent worktree file. The Codex home is now read before the hooks file, so a machine without Codex reports nothing even for a broken file (the reviewer's observation)."
    },
    {
      "id": "R-2",
      "severity": "minor",
      "description": "Trust keys were built from Git's symlink-resolved paths while Codex keys by the path it was opened with, so hooks trusted through a symlinked checkout path would be reported as untrusted.",
      "paths": [
        "src/doctor/codex-trust.ts",
        "dist/doctor/codex-trust.js",
        "dist/doctor/codex-trust.js.map",
        "tests/doctor-codex-trust.test.ts",
        "docs/runbooks/context-freshness.md"
      ],
      "disposition": "fixed",
      "response": "When the resolved key has no entry, a hooks.state entry whose path resolves to the same hooks file is matched by its event:group:handler suffix, preferring one that records trust; project trust does the same for the checkout and main checkout. A symlink test covers trusted and stale aliases, and the runbook states the unresolved-path keying."
    }
  ]
}
```
