---
date: 2026-09-26
roadmap: MO-26-09-26-23.56.05
outcome: completed
---

# Claude routing default

Raised the optional bridge's default from 20% to 30% remaining. Chris requested
more supervision headroom while other Codex chats continue consuming shared allowance.
Saved thresholds remain authoritative and delegation remains off until enabled.
The package is distributed by explicit installation from reviewed Morpheus source;
there is no registry publication or automatic migration of personal settings.

Validation: plugin syntax checks and all 33 plugin tests pass. The new regression
reads fresh settings from an isolated store, checks routing above/at/below 30%,
then saves 20% and checks that its value and strict routing boundary survive reload.
Root typecheck, all 1,433 tests, lint, compile and PM index passed; generated output
remained unchanged.

Discovery: no graph MCP tools were exposed to this session. The installed graph
CLI's list_projects attempt exited 1 without results; exact-checkout index repair
and coverage were attempted. Coverage failed because the daemon could not accept a
client within 30 seconds. Configuration-literal search and direct reads covered
config.mjs, store.mjs, config.test.mjs and installer behavior. No graph completeness
claim is made. This changes an existing default and introduces no generic module
or dependency.

## Independent review

Independent small-risk review completed in approximately 2 minutes with no findings. The reviewer verified the default, strict routing boundary, saved preferences, opt-in behavior, documentation and related callers; all 5 focused configuration tests passed. No fixes or follow-up were needed. Graph coverage remained unavailable, so review used direct source evidence.

```morpheus-review
{
  "version": 1,
  "base": "2334e13a3c28a4a338919c8d5b0ac42d3bde557d",
  "reviewed": "2ca683c11140d1452c1e09d2a16610c711b4f77a",
  "covered": "2ca683c11140d1452c1e09d2a16610c711b4f77a",
  "authorSession": "01a0e1a2-c598-77e3-b0c3-5df782094708",
  "reviewerSession": "/root/threshold_reviewer",
  "risk": "small",
  "elapsedMinutes": 2,
  "outcome": "complete",
  "summary": "Independent small-risk review completed in approximately 2 minutes with no findings. The reviewer verified the default, strict routing boundary, saved preferences, opt-in behavior, documentation and related callers; all 5 focused configuration tests passed. No fixes or follow-up were needed. Graph coverage remained unavailable, so review used direct source evidence.",
  "findings": []
}
```
