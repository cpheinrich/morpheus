---
date: 2026-11-04
roadmap: MO-26-11-04-21.16.59
tags: [engineering, devops, factory]
---

# Clarify Factory workspaces, routing and permissions

## The ask

This is a documentation-only follow-up to PR611, authorized by Chris. The goal is to make the
Factory README, both delegation skills and `architecture.md` §18.0 match current source. It also
adds a worked multi-repository example and answers Chris's question: does every session need Full
access, or only multi-repository ones?

## What changed

- **Permissions depend on the coordinator** (new README section, mirrored in both skills and
  §18.0).
  - **Codex coordinating:** verified full access is required for every delegation, single- or
    multi-repository. Approval `never` maps to a `bypassPermissions` Claude worker or a full-access
    Codex worker. `on-request` maps to Claude `default` or `read-only`. Other approvals are
    refused. An unloaded desktop task also needs an active latest turn recorded with
    `permission_profile.type: "disabled"` and `sandbox_policy.type: "danger-full-access"`.
  - **Claude coordinating:** full access is not needed. Each mode maps without widening.
  - Extra checkouts never widen a mode.
- **Answer to Chris.** The requirement depends on the coordinator, not on the number of
  repositories, and it predates multi-repository support. The full-access refusal text first
  appears in commit 57f84625 (PR271, 2026-09-25). A Codex task must be on Full access for any
  Factory delegation. A Claude session must not.
- **Routing.** §18.0 said that with no eligible gateway the work "keeps with the coordinator".
  `route()` in fact picks the other provider's native login. An explicit request for the
  coordinator's own provider with no eligible gateway is refused. After the first successful
  launch, `pinnedRoute` never silently switches. The README now states this as a numbered rule.
- **Fresh conversations.** The previous text said a fresh conversation "never shares one the
  primary maps", which read as full isolation. Ownership is per root task: an idle fresh
  conversation's adopted linked worktree can later be adopted by the primary or by another fresh
  conversation (PR611's FAC-R2). Isolation holds between root tasks, and active writers stay
  serialized. Runtime is unchanged.
- **Worked example.** A, then B, then C added on the same native session, then a delegation with
  no targets. It also covers a separate root task, a fresh conversation, a claimed-worktree
  variant and cleanup, with the tree and record shapes.
- **Install and update.** A route-dependent prerequisites table, including the existing
  `claude auth logout` evidence. Source edits and pulls change nothing until the installer is
  re-run. A new session is needed to load updated tools and skills. `config.json` (mode, gateways,
  key and admin references) is preserved.
- **Boundaries.** Workers execute on the bridge host, a gateway provides model access only, a
  multi-machine fleet is out of scope, and Paperclip is not part of agent-facing routing.
- **Small corrections:**
  - The Claude skill said `codex_wait` where the current contract is `factory_wait`.
  - Both skills now name the installed README path. Claude Code installs only `claude-plugin/`,
    so a relative link from that skill resolves in the Morpheus source and in `~/plugins/factory`,
    but not in Claude's plugin cache. The skill says so.

## Dead ends and notes

- I first wrote "anything else → refused" for a Claude worker behind a gateway. Source passes the
  session's mode through unchanged (`claudeArgs` does no mapping), so the table now says "the same
  mode".
- Checking the controller's diagnosis against source: the restriction is not new. A loaded
  restricted task can still run `factory_inspect`, because `inspect` does not call
  `permissionMode`. Delegation is then refused. An unloaded restricted task fails earlier, at
  `recordedSnapshot`.

## Result

This is a documentation change; runtime behaviour is unchanged. The example's shapes were checked
by running the real `resolveWorkspace` and `claimCheckouts` against throwaway repositories (Appendix
A). Links, JSON and the delegate schema were checked mechanically. Plugin check, focused plugin
tests and repository checks pass (Appendix B).

## Appendix A — example verification

The script was run with `FACTORY_HOME` set to a temporary directory, on three empty Git repositories
(`app`, `lib`, `docs`).

| Action | Result |
|---|---|
| Primary, with targets `app` and `lib` | `worktrees/<hash(task)>/primary/app-<8hex>` and `lib-<8hex>`, `source` = original, `owned: true` |
| Primary map plus `docs` | `primary/docs-<8hex>` added; earlier entries unchanged |
| Fresh slot `fresh-abcdef12`, with `app` and the primary checkouts in `avoid` | `fresh-abcdef12/app-<same 8hex>` |
| `workspaces.json` | Keyed by checkout path, with `{taskId, project, source, claimedAt}` |
| Second task, with target `app` | Its own `worktrees/<hash(task2)>/…`; naming task 1's checkout is refused ("owned by another Factory task") |

The `delegate` arguments in the example are each accepted by `z.object(factorySpecs.delegate[1]).strict()`.

## Appendix B — checks run

| Command | Result |
|---|---|
| `python3 /tmp/mo-linkcheck.py` (local links, anchors, README JSON blocks) on the README and both skills | 0 problems |
| `node scripts/check.mjs` (plugin) | exit 0 |
| `node --test tests/{workspace,config,snapshot,reverse,mcp}.test.mjs` (plugin) | 63 passed |
| `pnpm exec vitest run tests/factory-distribution.test.ts` | 3 passed |
| `pnpm typecheck`, `pnpm compile`, `pnpm morpheus pm index` | pass; no generated changes beyond the item |

The full root suite was not run. No shared core changed, and the diff is documentation and
records only. The plugin tests were run because the README and skills describe that code; no test
reads this prose.

## Independent review

Fresh independent review of PR612 at 49d3300b94471fa6ffe7faf18ee323ee1d6d8f9c (base e29014694545f1d9e6d8d9970b8dbe801df1cff6): CLEARED, risk small/low, no findings. The docs-only README, both skills and architecture §18.0 match current source on routing (gateway, else the other provider's native login; own-provider request without an eligible gateway is refused; pinned only after a successful launch), coordinator-dependent permissions and fresh-conversation ownership. The worked example matches the real hash lengths, slot names, session keys, record and workspaces.json shapes, and claim-after-launch ordering. Local links and anchors resolve, and no personal paths appear. No edits, no GitHub writes, no tests rerun. Timing is not measured here; the author measures it.

The author made no changes in response, because there were no findings. This was the initial review only, with no follow-up or finalization turn. The controller measured the reviewer's duration with clock readings around its invocation.

```morpheus-review
{
  "version": 2,
  "base": "e29014694545f1d9e6d8d9970b8dbe801df1cff6",
  "reviewed": "49d3300b94471fa6ffe7faf18ee323ee1d6d8f9c",
  "covered": "49d3300b94471fa6ffe7faf18ee323ee1d6d8f9c",
  "authorSession": "88f10e21-afde-43d7-a25d-f8986229efe2",
  "reviewerSession": "claude/23247cad-e15a-4b95-9338-f64174b30fca",
  "risk": "small",
  "elapsedMinutes": 1.3198333333333334,
  "timing": {
    "source": "clock",
    "durationMs": 79190,
    "evidence": "Controller clock readings around the reviewer invocation: start 2026-11-05T05:26:40.041Z, terminal 2026-11-05T05:27:59.231Z (Factory fresh run 1e490f06-1600-4741-b0ef-deeeba70e0b5, native reviewer session 23247cad-e15a-4b95-9338-f64174b30fca)."
  },
  "outcome": "complete",
  "summary": "Fresh independent review of PR612 at 49d3300b94471fa6ffe7faf18ee323ee1d6d8f9c (base e29014694545f1d9e6d8d9970b8dbe801df1cff6): CLEARED, risk small/low, no findings. The docs-only README, both skills and architecture §18.0 match current source on routing (gateway, else the other provider's native login; own-provider request without an eligible gateway is refused; pinned only after a successful launch), coordinator-dependent permissions and fresh-conversation ownership. The worked example matches the real hash lengths, slot names, session keys, record and workspaces.json shapes, and claim-after-launch ordering. Local links and anchors resolve, and no personal paths appear. No edits, no GitHub writes, no tests rerun. Timing is not measured here; the author measures it.",
  "findings": []
}
```
