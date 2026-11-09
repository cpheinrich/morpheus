---
tags: [engineering]
---
# Remove obsolete Paperclip routing from Factory

Roadmap: MO-26-11-03-22.16.36

Chris explicitly requested removal of Paperclip references from the Factory plugin because it is unconfigured and unused; current work uses gateway workers. Removed the remote-pool delegation instructions, Paperclip README setup/recovery guidance, eleven `pool_*` MCP tools and their exported discovery contract, and the pool CLI help/setup/dispatch entry points. The CLI now advertises the six current `factory.*` operations. Legacy backend pool/HQ modules remain for separate consumers, outside agent discovery; broader integration deletion was not authorized by this task. Gateway configuration and active bridge processes were not changed.

Verification: `node --test plugins/factory/tests/mcp.test.mjs plugins/factory/tests/release.test.mjs plugins/factory/tests/gateway-workers.test.mjs` passed 17 tests. These focused tests exercise actual MCP discovery and unknown-tool calls, CLI help/rejected old commands with no local state created, and both Codex and Claude synthetic gateway delegation. Initial test invocation failed because the fresh worktree lacked dependencies; installed the root and standalone plugin locked dependencies (`pnpm --ignore-workspace install --frozen-lockfile` for the plugin) and reran successfully. No provider API was called. `node scripts/check.mjs` in the plugin, root `pnpm typecheck`, `pnpm compile`, `morpheus pm index`, and `git diff --check` also passed; compile/index produced no additional changes.

Codebase graph Tier 2 used project Users-chrisheinrich-code-morpheus, generation 2026-11-04T06:11:02Z, complete bounded pool/tools query (53 entries), poolMethods snippet/trace, and coverage checks for the changed plugin paths. Sole recorded scope exclusion is generated `src/__pycache__`; no source gaps recorded. Graph trace reports no edges for the tool constant; exact source reads established its registration consumers. Coverage is best effort.

Deployment: source/PR only while the parent chat's gateway worker is active. Do not replace/restart the running bridge. After merge and a safe idle point, supported `node plugins/factory/scripts/install.mjs` updates the personal installation; new Codex chats load the new MCP inventory. Existing chats may retain old tool inventories until reopened. Evo's primary `AGENTS.md` still has a top-level "Morpheus Factory — Chris's routing preference" paragraph describing the Paperclip pool; its correction is owned by the parent Evo task and the user's current instruction supersedes it.

Independent review cleared the removal with no findings; the reviewer independently reran all 17 focused MCP, CLI and gateway tests. Gateway behavior and retained legacy backend consumers remain unchanged.

```morpheus-review
{
  "version": 2,
  "base": "3f5b9fef1cd02dd0cec566d5f2d4f8c9e7780b48",
  "reviewed": "522909af9ca38a32c76e3956ea38a16194005dd1",
  "covered": "0a77871c1db066b1ca607213576ff8b50e24a816",
  "authorSession": "01a1a533-4836-76b2-b082-0c9cdd36f968",
  "reviewerSession": "/root/remove_factory_paperclip/factory_cleanup_review",
  "risk": "normal",
  "elapsedMinutes": 0.7666666666666667,
  "timing": {
    "source": "clock",
    "durationMs": 46000,
    "evidence": "Reviewer clock readings: 2026-11-04 06:19:32 UTC to 2026-11-04 06:20:18 UTC; returned by /root/remove_factory_paperclip/factory_cleanup_review."
  },
  "outcome": "complete",
  "summary": "Independent review cleared the removal with no findings; the reviewer independently reran all 17 focused MCP, CLI and gateway tests. Gateway behavior and retained legacy backend consumers remain unchanged.",
  "findings": [],
  "followUps": [
    {
      "reviewerSession": "/root/remove_factory_paperclip/factory_cleanup_review",
      "commit": "0a77871c1db066b1ca607213576ff8b50e24a816",
      "outcome": "cleared",
      "elapsedMinutes": 0.15,
      "timing": {
        "source": "clock",
        "durationMs": 9000,
        "evidence": "Reviewer clock readings2026-11-04 06:24:16 UTC to2026-11-04 06:24:25 UTC; returned by /root/remove_factory_paperclip/factory_cleanup_review."
      },
      "scopeReason": "Late CI correction of legacy pool CLI test expectation after removal; no implementation change.",
      "summary": "Cleared test-only correction with no findings; independently reran 12 pool-unit tests."
    }
  ]
}
```

CI found one legacy CLI expectation still asserting the former pool recursion error. The new implementation correctly refused the obsolete command earlier. Updated that regression to require the unsupported-command error for removed pool commands while keeping recursion coverage for current start, codex.start and factory.delegate. No implementation change was needed.

The same independent reviewer cleared the late CI test-only correction with no findings and independently reran all 12 pool-unit tests. Final four-file focused run passed29 tests; no implementation changes followed the initial clearance.
