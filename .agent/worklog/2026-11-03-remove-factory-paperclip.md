---
tags: [engineering]
---
# Remove obsolete Paperclip routing from Factory

Roadmap: MO-26-11-03-22.16.36

Chris explicitly requested removal of Paperclip references from the Factory plugin because it is unconfigured and unused; current work uses gateway workers. Removed the remote-pool delegation instructions, Paperclip README setup/recovery guidance, eleven `pool_*` MCP tools and their exported discovery contract, and the pool CLI help/setup/dispatch entry points. The CLI now advertises the six current `factory.*` operations. Legacy backend pool/HQ modules remain for separate consumers, outside agent discovery; broader integration deletion was not authorized by this task. Gateway configuration and active bridge processes were not changed.

Verification: `node --test plugins/factory/tests/mcp.test.mjs plugins/factory/tests/release.test.mjs plugins/factory/tests/gateway-workers.test.mjs` passed 17 tests. These focused tests exercise actual MCP discovery and unknown-tool calls, CLI help/rejected old commands with no local state created, and both Codex and Claude synthetic gateway delegation. Initial test invocation failed because the fresh worktree lacked dependencies; installed the root and standalone plugin locked dependencies (`pnpm --ignore-workspace install --frozen-lockfile` for the plugin) and reran successfully. No provider API was called. `node scripts/check.mjs` in the plugin, root `pnpm typecheck`, `pnpm compile`, `morpheus pm index`, and `git diff --check` also passed; compile/index produced no additional changes.

Codebase graph Tier 2 used project Users-chrisheinrich-code-morpheus, generation 2026-11-04T06:11:02Z, complete bounded pool/tools query (53 entries), poolMethods snippet/trace, and coverage checks for the changed plugin paths. Sole recorded scope exclusion is generated `src/__pycache__`; no source gaps recorded. Graph trace reports no edges for the tool constant; exact source reads established its registration consumers. Coverage is best effort.

Deployment: source/PR only while the parent chat's gateway worker is active. Do not replace/restart the running bridge. After merge and a safe idle point, supported `node plugins/factory/scripts/install.mjs` updates the personal installation; new Codex chats load the new MCP inventory. Existing chats may retain old tool inventories until reopened. Evo's primary `AGENTS.md` still has a top-level "Morpheus Factory — Chris's routing preference" paragraph describing the Paperclip pool; its correction is owned by the parent Evo task and the user's current instruction supersedes it.
