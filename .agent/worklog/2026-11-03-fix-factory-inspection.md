---
date: 2026-11-03
roadmap: MO-26-11-03-12.41.12
tags: [engineering, factory]
---

# Repair Factory desktop inspection

Factory's provider-neutral and compatibility tools used only the MCP process's environment
identity. On desktop that identity can be missing or belong to an archived chat. Both refuse
before routing, while the independent doctor command can still read healthy gateway quota.
Codex's native MCP implementation overwrites request `_meta.threadId` with the caller's ID;
the bridge now reads that field, with an environment fallback for older hosts. Model arguments
cannot select the owner. A socket-level MCP regression exercises two chats through the same
process, including a stale environment and forged compatibility arguments.

The unloaded-task metadata reader also accepts in-place zstd compression and reports missing
metadata clearly. It never searches for another session, reopens an archived turn, or relaxes
active-turn/freshness/permission validation. Regression cases include compressed active/completed
turns, corrupt compression and absent files. Node already ships zstd; no dependency was added.

The remote Paperclip profile error is a separate, unconfigured execution surface, not evidence
that gateway quota or gateway delegation is broken. No remote profile or account was invented.
No user implementation was delegated as part of diagnosis. The current root stays the manager.

## Validation

- `node --test tests/mcp.test.mjs tests/snapshot.test.mjs` in `plugins/factory`: 9 passed
  on the initial implementation; rerun after final edits below.
- `node scripts/check.mjs` and `pnpm test` in `plugins/factory`: passed, 155 tests.
  This covers the bridge, MCP transport, ownership, metadata and gateway dependents.
- `pnpm exec vitest run tests/factory-distribution.test.ts`: 3 passed.
- `pnpm typecheck`, `pnpm compile`, `pnpm morpheus pm index`: passed; no generated drift.
- Root full suite was not run locally because shared core was not changed; CI owns it.
- Independent review and post-install live inspection are recorded below when complete.

## Open questions

None for this repair. Registering a new remote Paperclip pool is outside the gateway-inspection fix.

## Comparison with established projects

Chris requested an external best-practices comparison before finalizing, to minimize bespoke
inter-agent engineering. Sources inspected on 2026-11-03:

| Project | Relevant established pattern | Application here |
| --- | --- | --- |
| [MCP protocol](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/3c4d91b7e832d9b74338d56eed03403ccc662123/docs/specification/draft/basic/index.mdx#statelessness) | Its current draft separates connections from conversations and carries per-request context explicitly. This is draft guidance, not a protocol-version migration requirement. | Consume the metadata already delivered by the installed SDK; do not derive ownership from the stdio process lifetime. |
| [OpenAI Agents SDK](https://github.com/openai/openai-agents-python/blob/e355d69152d4f4730dfb03b63dbce53e8d9f5d8c/docs/multi_agent.md#core-sdk-patterns) | Manager-style agents-as-tools retain one coordinator; handoffs transfer active conversational ownership. [Session guidance](https://github.com/openai/openai-agents-python/blob/e355d69152d4f4730dfb03b63dbce53e8d9f5d8c/docs/sessions/index.md) chooses one continuation owner rather than layering mechanisms. | Preserve the existing manager and native worker conversation IDs. No second session-memory system or alternate model execution loop. |
| [A2A](https://github.com/a2aproject/A2A/blob/4735f4876449c6f381825d8a841b31b16c6ad0c4/docs/topics/life-of-a-task.md) | Conversation context and individual task identity are explicit and distinct, with states for completion, failure and required input. | Keep root ownership separate from delegated run identity. A2A is relevant if independently deployed agents later need protocol interoperability; this local MCP identity repair does not require that integration. |

The [native Codex adapter](https://github.com/openai/codex/blob/0ddee3e1d898f7823df97e9aaf08b420be51c804/codex-rs/core/src/mcp_tool_call.rs)
sets `_meta.threadId` from the actual calling thread, after building request metadata.
The [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/src/server/mcp.ts)
already passes request context to registered tool callbacks. The repair consumes that callback
argument rather than implementing a custom transport, handshake, correlation store or router.
The threadId field is Codex-specific host metadata, not an MCP-standard authentication claim.

Registry comparison: `@a2a-js/sdk` 1.3.0 (one direct dependency, registry modified 2026-09-29),
`@openai/agents` 0.21.0 (four direct dependencies, modified 2026-10-20), and
`@modelcontextprotocol/sdk` 1.32.2 (17 direct dependencies, modified 2026-10-23). Morpheus already
uses MCP SDK 1.31.0, which supports the needed callback. Adding A2A or Agents SDK would not
replace Codex's current-task/permission adapter or the native subscription CLI runners; it
would introduce a second execution/protocol layer. Keep the existing SDK and a small adapter
correction, with regression tests exercising the actual MCP client/server exchange.

Live source verification in an isolated bridge store read this real desktop task's active
model/settings, both gateway quota snapshots and an eligible route without launching a worker.
This proves the inspection path separately from model execution. Installed-host verification
follows merge.
