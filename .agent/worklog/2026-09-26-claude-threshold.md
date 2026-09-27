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
Repository checks are recorded below after completion.

Discovery: no graph MCP tools were exposed to this session. The installed graph
CLI's list_projects attempt exited 1 without results; exact-checkout index repair
and coverage were attempted. Configuration-literal search and direct reads covered
config.mjs, store.mjs, config.test.mjs and installer behavior. No graph completeness
claim is made. This changes an existing default and introduces no generic module
or dependency.
