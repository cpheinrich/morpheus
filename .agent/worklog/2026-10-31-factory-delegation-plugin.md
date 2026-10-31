# MO-26-10-31-04.37.59 — factory delegation plugin

Renamed `plugins/codex-claude/` to `plugins/factory/` and generalized the two-way
bridge into a provider-agnostic delegation layer with a `gateways` config, quota
read from the sub2api admin API, and placement (explicit model → most-headroom
gateway below the threshold → native).

## Review

A fresh reviewer found two substantive findings and six minor ones. The
substantive findings were: `route()` did not filter gateway candidates by the
delegate provider (a codex gateway with more headroom could be picked when Codex
coordinates, failing the delegation), and the sub2api admin credentials
(`FACTORY_ADMIN_*`) leaked into the delegated worker environment. Both were fixed:
`route()` now skips the coordinator's own provider, and gateway mode builds on
`subscriptionEnv`/`codexEnv` (which scrub admin and provider vars) instead of
spreading the full `process.env`. The minor findings (stale comment, stale tool
descriptions, dead `remaining()`, missing 0600 check, env scrubbing asymmetry,
single-instance assumption) were fixed or documented. A follow-up turn cleared
the fixes and raised three further minor items (a dead import, an untested 0600
check, a wording nit), all fixed. No substantive issue remains.

```morpheus-review
{
  "version": 2,
  "base": "e08d4e56a99d5e2619f2e0bbe5bf8e4f87db3431",
  "reviewed": "6768ba9ada9152c1845eca3917c2a811c8dc4e67",
  "covered": "ab3dac77fa7760fdaf7c751ece2f8a7a58f4fcc5",
  "authorSession": "ses_e6f078b7dffequWPGBJnFpal4a",
  "reviewerSession": "opencode/977dd986-9e3e-4d27-b618-ff9c15022af1",
  "risk": "normal",
  "elapsedMinutes": 8,
  "timing": {
    "source": "clock",
    "durationMs": 480000,
    "evidence": "Clock readings around the initial reviewer subagent invocation."
  },
  "outcome": "cleared",
  "summary": "Two substantive findings (route() did not filter the delegate provider; FACTORY_ADMIN_* leaked into the worker env) and six minor findings. All fixed or documented; a follow-up turn cleared the fixes and three further minor items were fixed.",
  "findings": [
    {
      "id": "F01",
      "severity": "substantive",
      "description": "route() treated every gateway as a candidate regardless of provider, so a gateway of the coordinator's own provider could be picked as the delegate and fail the delegation.",
      "paths": ["plugins/factory/src/config.mjs"],
      "disposition": "fixed",
      "response": "route() now filters g.provider !== primary, and a test covers the mixed-pool case."
    },
    {
      "id": "F02",
      "severity": "substantive",
      "description": "FACTORY_ADMIN_EMAIL/PASSWORD leaked into the delegated worker environment because gateway mode spread the full process.env and the strip regexes did not cover FACTORY_ADMIN_.",
      "paths": ["plugins/factory/src/claude.mjs", "plugins/factory/src/codex-exec.mjs", "plugins/factory/src/config.mjs"],
      "disposition": "fixed",
      "response": "FACTORY_ADMIN_ is added to the strip regexes, and gateway mode builds on subscriptionEnv/codexEnv instead of spreading process.env."
    },
    {
      "id": "F03",
      "severity": "minor",
      "description": "readGatewayQuota assumes one sub2api instance and one account per provider.",
      "paths": ["plugins/factory/src/config.mjs"],
      "disposition": "fixed",
      "response": "Documented as a limitation in a comment."
    },
    {
      "id": "F04",
      "severity": "minor",
      "description": "The threshold comment still described the old remaining-allowance semantics.",
      "paths": ["plugins/factory/src/config.mjs"],
      "disposition": "fixed",
      "response": "Comment rewritten to describe gateway usage."
    },
    {
      "id": "F05",
      "severity": "minor",
      "description": "The inspect tool descriptions still mentioned subscription allowance.",
      "paths": ["plugins/factory/scripts/mcp.mjs", "plugins/factory/scripts/claude-mcp.mjs"],
      "disposition": "fixed",
      "response": "Descriptions updated to gateway quota."
    },
    {
      "id": "F06",
      "severity": "minor",
      "description": "remaining() was dead production code after the re-architecture.",
      "paths": ["plugins/factory/src/config.mjs", "plugins/factory/tests/config.test.mjs"],
      "disposition": "fixed",
      "response": "Removed the function and its test."
    },
    {
      "id": "F07",
      "severity": "minor",
      "description": "resolveKeyRef did not enforce the documented 0600 mode on secret files.",
      "paths": ["plugins/factory/src/config.mjs"],
      "disposition": "fixed",
      "response": "resolveKeyRef now refuses a group/world-permission secret file, with a test."
    },
    {
      "id": "F08",
      "severity": "minor",
      "description": "Gateway mode did not scrub conflicting provider env vars the way native mode does.",
      "paths": ["plugins/factory/src/claude.mjs", "plugins/factory/src/codex-exec.mjs"],
      "disposition": "fixed",
      "response": "Gateway mode now builds on subscriptionEnv/codexEnv, which strip the provider overrides first."
    },
    {
      "id": "F09",
      "severity": "minor",
      "turn": 2,
      "description": "delegatedMarker was imported but unused after the gateway-mode change.",
      "paths": ["plugins/factory/src/claude.mjs", "plugins/factory/src/codex-exec.mjs"],
      "disposition": "fixed",
      "response": "Removed the unused import."
    },
    {
      "id": "F10",
      "severity": "minor",
      "turn": 2,
      "description": "The 0600 enforcement in resolveKeyRef was untested.",
      "paths": ["plugins/factory/tests/config.test.mjs"],
      "disposition": "fixed",
      "response": "Added a test for the secret:path success and the group/world-permission refusal."
    },
    {
      "id": "F11",
      "severity": "minor",
      "turn": 2,
      "description": "The 0600 error message said 'readable' but the check rejects any group/world permission bit.",
      "paths": ["plugins/factory/src/config.mjs"],
      "disposition": "fixed",
      "response": "Reworded to 'has group/world permissions'."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "opencode/977dd986-9e3e-4d27-b618-ff9c15022af1",
      "commit": "c66e673375dee4d106ec6edf9a337a2b82cd3027",
      "outcome": "cleared",
      "elapsedMinutes": 3,
      "timing": {
        "source": "clock",
        "durationMs": 180000,
        "evidence": "Clock readings around the follow-up reviewer subagent invocation."
      },
      "summary": "Both substantive findings are resolved and no new substantive issue was introduced. Three minor items (dead import, untested 0600 check, wording) were noted and subsequently fixed."
    }
  ]
}
```
