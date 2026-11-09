---
date: 2026-11-09
agent: codex
roadmap: MO-26-11-09-12.38.42
outcome: review
tags: [engineering]
summary: Added an explicit one-shot command that approves enabled Codex hook changes for the current Git project.
---

# Approve pending Codex project hooks

A person can ask their agent to run `morpheus codex hooks approve` inside a checkout.
Codex lists its current definitions and prepares the staged config update. We filter to
enabled project hooks at the root, use the main checkout for a linked worktree, and verify
the recorded hashes. The helper is never invoked by project setup or startup.

Reused Morpheus's checkout identity and Codex home resolution. Used the existing Node
stdio and readline APIs for the small app-server exchange, with no new dependency or
separate approval database. An initial implementation used a for-await loop that would
close the shared reader on the first response. Reading the next line directly keeps the
connection open for the full approval and verification exchange.

## Verification

- `pnpm typecheck`, `pnpm compile`, and `pnpm morpheus pm index`.
- `pnpm exec vitest run tests/codex-hooks.test.ts tests/doctor-codex-trust.test.ts`
  (34 tests). The new tests cover the exact write scope, linked checkout routing, no-op
  and list-error paths, concurrent approvals, and preservation when staging fails or the live file changes.
- `morpheus complexity check` passed (CCN limit 15).
- The compiled CLI against the Mac app's bundled backend with an isolated `CODEX_HOME`:
  approved a new hook, made a repeat invocation a no-op, approved a changed definition,
  and preserved unrelated trust and the config mode. Reproduced the bundled backend's
  commented inline TOML corruption with a private fixture and confirmed the live fixture
  remained byte-identical. Two concurrent CLI invocations for distinct repos sharing a
  Codex home refused one overlapping operation, and its retry retained both approvals.
  The live config was left for the user's later trial.

The requester narrowed approval to Morpheus project hooks while the PR was in CI. The
command now requires a committed Morpheus manifest and exact committed bytes for each
eligible root hook file. Added coverage for unrelated checkouts, dependency-path hooks,
and a dirty hook file. The real backend probe confirmed the dirty definition was refused,
then approved when committed. A subsequent review reproduced a temporary file change
during hook listing. Morpheus now checks the Codex hash against the committed handler
before making a config edit. The bundled backend agreed with the committed hashes for all
four Morpheus hooks and all five Evo hooks in isolated copies.

The independent review found that concurrent Codex servers could lose a hook approval and that Codex could corrupt valid commented inline TOML. Morpheus now locks its own approvals and validates a private staged edit before replacing live config. It also qualifies the no-op message. The reviewer reran the isolated Mac backend probe and cleared all findings. Other Codex writers do not share the Morpheus lock.

```morpheus-review
{
  "version": 2,
  "base": "c65d40a628049df4fc897b02187d0d3b07ffcd54",
  "reviewed": "3cfc47aa110386fb2efaa1030bd48aa09ae64f5b",
  "covered": "d735a6b9c70c9db4d2de884acf4440f602dff224",
  "authorSession": "01a1c1f7-edcd-7ac3-9ab0-99d0f256650b",
  "reviewerSession": "/root/codex_hooks_review",
  "risk": "high",
  "elapsedMinutes": 2.8333333333333335,
  "timing": {
    "source": "clock",
    "durationMs": 170000,
    "evidence": "Root clock readings for /root/codex_hooks_review initial turn: 2026-11-09T20:41:31Z before dispatch, 2026-11-09T20:44:21Z after receiving the verdict."
  },
  "outcome": "complete",
  "summary": "The independent review found that concurrent Codex servers could lose a hook approval and that Codex could corrupt valid commented inline TOML. Morpheus now locks its own approvals and validates a private staged edit before replacing live config. It also qualifies the no-op message. The reviewer reran the isolated Mac backend probe and cleared all findings. Other Codex writers do not share the Morpheus lock.",
  "findings": [
    {
      "id": "CH-1",
      "severity": "substantive",
      "description": "Independent Codex app-server processes accepted the same expectedVersion and lost one concurrent approval.",
      "paths": [
        "src/cli/codex-hooks.ts"
      ],
      "disposition": "fixed",
      "response": "Hold one per-home lock across the complete Morpheus operation. The two-project probe confirmed one overlapping invocation was refused and its retry preserved both approvals."
    },
    {
      "id": "CH-2",
      "severity": "substantive",
      "description": "The app-server could corrupt valid commented inline TOML before the command verified it.",
      "paths": [
        "src/cli/codex-hooks.ts"
      ],
      "disposition": "fixed",
      "response": "Stage privately, compare parsed settings, and atomically install the verified edit only if the live snapshot still matches. The bundled backend probe left the valid inline config byte-identical."
    },
    {
      "id": "CH-3",
      "severity": "minor",
      "description": "The no-op output implied there were no pending hooks in an untrusted project, whose hooks Codex does not list.",
      "paths": [
        "src/cli/codex-hooks.ts"
      ],
      "disposition": "fixed",
      "response": "The output now reports what Codex listed and states the project trust prerequisite."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "/root/codex_hooks_review",
      "commit": "d735a6b9c70c9db4d2de884acf4440f602dff224",
      "outcome": "cleared",
      "elapsedMinutes": 0.5666666666666667,
      "timing": {
        "source": "clock",
        "durationMs": 34000,
        "evidence": "Root clock readings for /root/codex_hooks_review follow-up: 2026-11-09T20:46:29Z before dispatch, 2026-11-09T20:47:03Z after receiving the verdict."
      },
      "summary": "Independently reran the compiled isolated Mac backend probe. Verified serialized commands, byte-identical live config on invalid staged output, saved approvals for new and changed hooks, no-op, file mode and unrelated trust. Cleared all three findings. No new findings."
    }
  ]
}
```
