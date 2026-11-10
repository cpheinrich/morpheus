---
roadmap: MO-26-11-09-22.31.46
tags: [engineering, devops]
---

# Use Tantivy context in reviews and delegated tasks

Earlier local Codex transcripts showed project-record shell searches in sixteen reviewer or child
sessions without an MCP search. The canonical review packet asked for relevant decisions but did
not specify the context tool. Fresh child sessions did not consistently receive the root session's
startup cue. Codebase-memory has explicit tool selection guidance, a device-level SubagentStart
hook as well as SessionStart, and exact-checkout indexing and verification. The Morpheus context
cue now travels in SubagentStart, the review packet, and both Factory handoffs. Factory's existing
MCP worktree pin remains in force.

Tantivy is the only live engine for MCP and CLI. The startup core stays opt-in through the existing
manifest; historical profile rows remain readable. Reused the pinned upstream Tantivy binding and
its published wheel hashes. Managed updates provision the dependency before replacing the CLI;
a missing binding never falls back to ripgrep.

## Verification

The previous installed release ran its managed updater against an isolated candidate main and an
empty tool and npm prefix. A missing Python interpreter blocked replacement before npm installed
anything. Retrying with Python installed the candidate and a fresh stdio MCP returned a Tantivy
citation and opened it. Hook input produced an advisory SubagentStart cue inside a project.
Factory integration tests passed (21); no live gateway job was launched.

Typecheck, lint, compile, project index, focused tests, diff check and complexity passed. The single
local full run exposed only the scaffold text budget; the affected tests passed after shortening
the guidance. The reviewer independently reran the 30 focused regression tests after fixes.

## Independent review

The independent reviewer confirmed real MCP search and a cited read, found three cutover regressions, then cleared all three fixes: preflight before replacement, separate historical profiling, and a private temporary index for older checkouts.

The fresh native reviewer made a live project-record search and cited read without shell record
search. That session's already-installed server still answered with ripgrep. The reviewer also
launched the candidate MCP over stdio in the review checkout: Tantivy returned a citation with
no fallback and the cited read succeeded.

```morpheus-review
{
  "version": 2,
  "base": "89420181c3f80d857a2742847ccc21a397830819",
  "reviewed": "c5f8f4580480ea6fa3a786da399302a122b3617a",
  "covered": "2c78800a70e90a9761185ee97dd81a99e319d603",
  "authorSession": "01a1c41a-fc72-70f1-afda-bcb0d916cf2e",
  "reviewerSession": "/root/review_context_tantivy",
  "risk": "normal",
  "elapsedMinutes": 2.2984666666666667,
  "timing": {
    "source": "runner",
    "durationMs": 137908,
    "evidence": "Native task_complete for reviewer turn 01a1c42f-f659-7e41-9c80-76768334544c: duration_ms=137908."
  },
  "outcome": "complete",
  "summary": "The independent reviewer confirmed real MCP search and a cited read, found three cutover regressions, then cleared all three fixes: preflight before replacement, separate historical profiling, and a private temporary index for older checkouts.",
  "findings": [
    {
      "id": "CTX-001",
      "severity": "substantive",
      "description": "Direct install can replace the global CLI before a missing runtime fails.",
      "paths": [
        "src/cli/self.ts",
        "src/self.ts",
        "src/context-search/update-bridge.ts"
      ],
      "disposition": "fixed",
      "response": "Prepare the runtime after clean build verification and before npm replacement; test that failure preserves the installed receipt and runs no npm command."
    },
    {
      "id": "CTX-002",
      "severity": "substantive",
      "description": "Post-cutover compact profiling mixes with the historical Tantivy cohort and resumed-session first search.",
      "paths": [
        "src/context-search/rollout.ts",
        "src/context-search/trace-summary.ts",
        "src/context-search/trace-pipeline.ts"
      ],
      "disposition": "fixed",
      "response": "Write a distinct compact arm and separate historical/current pipeline keys; assert both phases and their first results for one resumed session."
    },
    {
      "id": "CTX-003",
      "severity": "substantive",
      "description": "A checkout without a safe ignored cache cannot search after cutover.",
      "paths": [
        "src/context-search/retrieve.ts",
        "src/context-search/local-state.ts",
        "src/context-search/warm.ts"
      ],
      "disposition": "fixed",
      "response": "Use an owner-private temporary index for both transports when needed and clean it after success or failure. Skip background warming without a persistent cache."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "/root/review_context_tantivy",
      "commit": "2c78800a70e90a9761185ee97dd81a99e319d603",
      "elapsedMinutes": 0.6818833333333333,
      "timing": {
        "source": "runner",
        "durationMs": 40913,
        "evidence": "Native task_complete for reviewer turn 01a1c432-e15c-7dd3-9200-6f7df49d2d35: duration_ms=40913."
      },
      "outcome": "cleared",
      "summary": "Independently reran 30 focused tests and verified installed receipt preservation, separate cohorts, and private scratch cleanup on success and failure. No new findings."
    }
  ]
}
```
