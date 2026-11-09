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

The independent review found that concurrent Codex servers could lose a hook approval and that Codex could corrupt valid commented inline TOML. Morpheus now locks its own approvals and validates a private staged edit before replacing live config. It also qualifies the no-op message. The reviewer reran the isolated Mac backend probe and cleared all findings. Other Codex writers do not share the Morpheus lock. The requester narrowed the scope to Morpheus projects before merge. A new review found a listing-to-file-check race, so approvals now require a hash match to the committed handler. The reviewer cleared the corrected scope, and 34 focused tests and isolated Mac backend checks passed.

```morpheus-review
{
  "version": 2,
  "base": "c65d40a628049df4fc897b02187d0d3b07ffcd54",
  "reviewed": "3cfc47aa110386fb2efaa1030bd48aa09ae64f5b",
  "covered": "69c59be4b0ee3ac3ca80f6548677d7d35f21e081",
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
  "summary": "The independent review found that concurrent Codex servers could lose a hook approval and that Codex could corrupt valid commented inline TOML. Morpheus now locks its own approvals and validates a private staged edit before replacing live config. It also qualifies the no-op message. The reviewer reran the isolated Mac backend probe and cleared all findings. Other Codex writers do not share the Morpheus lock. The requester narrowed the scope to Morpheus projects before merge. A new review found a listing-to-file-check race, so approvals now require a hash match to the committed handler. The reviewer cleared the corrected scope, and 34 focused tests and isolated Mac backend checks passed.",
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
    },
    {
      "id": "CH-4",
      "turn": 3,
      "severity": "substantive",
      "paths": [
        "src/cli/codex-hooks.ts"
      ],
      "description": "Comparing only the current file to HEAD after listing could accept a hash reported from a temporary uncommitted definition.",
      "disposition": "fixed",
      "response": "Verify the reported key and hash against Git HEAD before staging. The test rejects a mismatched hash even when the working file matches the committed file. The isolated backend probe left config byte-identical."
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
    },
    {
      "reviewerSession": "/root/codex_hooks_review",
      "commit": "fdcbbe5b584d70686729c5909477afd2562bbaeb",
      "outcome": "blocked",
      "summary": "Found CH-4 with an isolated backend probe: an uncommitted hook hash survived the subsequent file equality check.",
      "elapsedMinutes": 0.9,
      "timing": {
        "source": "clock",
        "durationMs": 54000,
        "evidence": "Root clock readings for /root/codex_hooks_review: 2026-11-09T20:49:58Z before dispatch, 2026-11-09T20:50:52Z after return."
      },
      "scopeReason": "Requester narrowed approvals to committed definitions owned by Morpheus projects before merge."
    },
    {
      "reviewerSession": "/root/codex_hooks_review",
      "commit": "69c59be4b0ee3ac3ca80f6548677d7d35f21e081",
      "outcome": "incomplete",
      "summary": "The reviewer tool ended the turn before returning a verdict. The author resumed with a read-only diff and focused tests.",
      "elapsedMinutes": 0.48333333333333334,
      "timing": {
        "source": "clock",
        "durationMs": 29000,
        "evidence": "Root clock readings for /root/codex_hooks_review: 2026-11-09T20:51:17Z before dispatch, 2026-11-09T20:51:46Z after return."
      }
    },
    {
      "reviewerSession": "/root/codex_hooks_review",
      "commit": "69c59be4b0ee3ac3ca80f6548677d7d35f21e081",
      "outcome": "cleared",
      "summary": "CH-4 fixed. All reported keys and hashes must match a committed hook before save. The reviewer confirmed the isolated config stayed byte-identical on a mismatch and passed 34 focused tests. No new findings.",
      "elapsedMinutes": 0.3,
      "timing": {
        "source": "clock",
        "durationMs": 18000,
        "evidence": "Root clock readings for /root/codex_hooks_review: 2026-11-09T20:51:46Z before dispatch, 2026-11-09T20:52:04Z after return."
      }
    }
  ]
}
```
