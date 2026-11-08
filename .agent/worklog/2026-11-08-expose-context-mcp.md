---
date: 2026-11-08
roadmap: MO-26-11-08-01.42.14
tags: [engineering]
summary: "Expose the project context pilot through MCP and measure the cutover."
---

Chris delegated the MCP build, pilot cutover, and Morpheus installation. Acceptance covers
all five read-only tools, cold Factory orientation, explicit link traversal, visible result
evidence, preserved rollout assignment, local transport profiling, and live client verification.
Use local deterministic probes and existing CI. No additional paid provider work is budgeted.

The MCP and CLI use the same retrieval backend. The host supplies the session identity
and worktree. Factory workers use the admitted checkout. The post-tool hook verifies
the cited source against the result presented to the model. Search execution and visible
evidence have separate trace events. Older trace rows remain readable.

Used the official MCP SDK version already pinned by the Factory plugin. Its dependency
tree includes HTTP support even though the new server uses stdio. Reusing its protocol,
validation and lifecycle avoids maintaining a custom JSON-RPC implementation.

A fresh Codex app-server thread discovered all five tools and returned a Tantivy citation
using the real thread identity. The relationship probe reached a GitHub PR through a roadmap
item. The fixture used a local stdio server and no provider calls. The read-hook regression
uses the host's MCP result envelope and rejects fallback content that Codex did not present.

The historic trace report separates actual engine from assigned arm. Several historical
queries in the ripgrep arms used a local Tantivy override. A transport cutover comparison
is observational, while assignment still supports the engine comparison.

Independent review identified a missing claimed-branch task pointer for cold workers,
an omitted Factory subdirectory registration, arm-dependent visibility counts, and a
result format that could exceed Codex's observable line range. Added focused regressions.
Also aligned descendant thread identity with the provider session ID used by hooks.
The trusted startup hook can arm bounded MCP sessions independently of the optional
first-prompt reminder. A current core citation counts for visibility but cannot clear
the additional task-context requirement.

The initial full suite caught two startup instruction budget checks. Moved authoring
details into the PM runbook and generated worklog guide, and reran those focused tests.
Two Factory timeout fixtures failed during concurrent full-suite execution and passed
in isolation. The Factory registration regression passed with the admitted subdirectory.

Independent review cleared the context MCP after verifying worktree scope, cold Factory orientation and host-visible evidence across all pilot arms.

```morpheus-review
{
  "version": 2,
  "base": "4629f043d307acdaa261d50f21ecfee97c895405",
  "reviewed": "fc40ff9c20f5cd54bc15e2d4627d4003dd69af14",
  "covered": "4d6d5ed8328d156ca5bb225f069ae9bfca03f3d6",
  "authorSession": "01a1b4d0-b0d9-7cd1-9f03-33349cd7f590",
  "reviewerSession": "/root/context_mcp_independent_review",
  "risk": "normal",
  "elapsedMinutes": 2.3349166666666665,
  "timing": {
    "source": "runner",
    "durationMs": 140095,
    "evidence": "Root runner transcript, invocation and result timestamps 09:56:35.970 to 09:58:56.065 UTC."
  },
  "outcome": "complete",
  "summary": "Independent review cleared the context MCP after verifying worktree scope, cold Factory orientation and host-visible evidence across all pilot arms.",
  "findings": [
    {
      "id": "CMCP-1",
      "severity": "substantive",
      "description": "Cold Factory sessions with no task binding omitted an active claimed task from the overview.",
      "paths": [
        "src/context-search/mcp-scope.ts"
      ],
      "disposition": "fixed",
      "response": "Resolve the task from the admitted checkout branch when no binding exists and verify the overview's roadmap pointer."
    },
    {
      "id": "CMCP-2",
      "severity": "substantive",
      "description": "A Factory worker starting in an admitted checkout's subdirectory received no MCP registration.",
      "paths": [
        "plugins/factory/src/context-mcp.mjs"
      ],
      "disposition": "fixed",
      "response": "Discover the admitted Git top-level from the requested subdirectory and verify both launchers."
    },
    {
      "id": "CMCP-3",
      "severity": "substantive",
      "description": "Required startup sources were excluded from visibility metrics, biasing observed results across rollout arms.",
      "paths": [
        "src/context-search/task-start.ts"
      ],
      "disposition": "fixed",
      "response": "Validate visibility against the eligible corpus, then separately require a non-core citation to satisfy a pending task."
    },
    {
      "id": "CMCP-4",
      "severity": "substantive",
      "description": "A valid broad query could exceed the Codex hook's line limit and lose evidence.",
      "paths": [
        "src/context-search/engine.ts",
        "src/session/read-hook.ts"
      ],
      "disposition": "fixed",
      "response": "Cap complete MCP excerpts within the observable line budget and verify a broad cited result clears the task."
    },
    {
      "id": "CMCP-5",
      "severity": "substantive",
      "description": "Inherited Git identity variables could redirect a Factory subdirectory launch to another worktree.",
      "paths": [
        "plugins/factory/src/context-mcp.mjs",
        "plugins/factory/src/workspace.mjs",
        "plugins/factory/tests/reverse.test.mjs"
      ],
      "disposition": "fixed",
      "response": "Reuse Factory's sanitized Git environment and confirm the resolved root contains the admitted cwd.",
      "condition": {
        "paths": [
          "plugins/factory/src/context-mcp.mjs",
          "plugins/factory/src/workspace.mjs",
          "plugins/factory/tests/reverse.test.mjs"
        ],
        "evidence": "The targeted Factory registration test must pass with GIT_DIR and GIT_WORK_TREE directed to a different repository while the MCP cwd remains the admitted worktree."
      },
      "conditionMet": "The registration regression passed for Codex and Claude from the admitted subdirectory with both Git variables pointing at another real Morpheus fixture."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "/root/context_mcp_independent_review",
      "commit": "6a737c3649ff44d00f2dd88839f2e51831b90940",
      "outcome": "cleared",
      "elapsedMinutes": 0.9009,
      "timing": {
        "source": "runner",
        "durationMs": 54054,
        "evidence": "Root runner transcript, invocation and result timestamps 10:00:43.966 to 10:01:38.020 UTC."
      },
      "summary": "All original findings cleared. Clearance was conditional on a scoped Factory Git environment fix and regression."
    }
  ]
}
```
