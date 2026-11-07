---
date: 2026-11-07
agent: codex
roadmap: MO-26-10-28-14.10.57
tags: [engineering, research, agent-workflow]
outcome: implemented
summary: "Implement a local 60/20/20 project-context search trial."
---

# Local context search trial

The session policy assigns bounded Tantivy, bounded ripgrep and full ripgrep
with a stable session hash. The project manifest opts in and names critical
startup files and corpus globs. The worktree keeps its index under Git metadata.
Common Git metadata retains capped, expiring trace metadata. Required reads
still pass through the ordinary evidence hook and freshness gate.

The CLI smoke replay froze three recent worklogs per project and exercised all
three arms with a 1,000-token cap. The expected excerpt appeared in 5/6 Tantivy
queries and 2/6 queries in each ripgrep arm. All 24 trace rows associated
assignments with their queries, recorded the actual engine and carried no query
or excerpt text. Estimated startup tokens were 9,651 bounded vs. 115,390 full
in the larger fixture and 8,758 bounded vs. 25,978 full in the smaller fixture.
These are explicit required-read tokens, excluding the provider's other prompt
overhead. One-shot CLI wall time was roughly 0.6–1.0 s for warm queries and
2.4–2.8 s for the two first Tantivy queries including the index build. The
resident benchmark's query times excluded CLI process and startup overhead.
These checks replayed retrieval, not task completion.

Focused checks cover session start, evidence, the freshness gate, cleanup,
dispatch, search sources, exact token caps, engine selection and Tantivy cache
invalidation. Consumer enrollment and real-session traces require the released
CLI and the projects' enrollment manifests.

## Independent review

Independent review conditionally cleared the rollout after three focused fixes.
The bounded receipt smoke also exercised real read-hook payloads and refresh.
Each worktree retains its content-addressed cache generations until cleanup.

Full CI exposed missing ripgrep and two startup guide byte-budget failures. The correction provisions both engines in Morpheus CI and leaves project-specific startup instructions to enrollment. Actionlint, typecheck, compile and 261 focused tests passed. The reviewer cleared the correction.

```morpheus-review
{
  "version": 2,
  "base": "ebc692dcc1ef3d6bd0a649e5c3a6a4b5607d7fc4",
  "reviewed": "cb0ec81f6b912156ee1bd3ad19d8126aedbaf702",
  "covered": "1233d8a7dae217dcbf130c92f15e7a41f1932202",
  "authorSession": "01a1b4d0-b0d9-7cd1-9f03-33349cd7f590",
  "reviewerSession": "/root/pilot_review",
  "risk": "normal",
  "elapsedMinutes": 2.65,
  "timing": {
    "source": "clock",
    "durationMs": 159000,
    "evidence": "Author clock observations bracketing reviewer invocation and delivered verdict: 2026-11-07 22:24:57\u201322:27:36 UTC."
  },
  "outcome": "complete",
  "summary": "Independent review conditionally cleared the rollout after three focused fixes.",
  "findings": [
    {
      "id": "CTX-1",
      "severity": "substantive",
      "description": "A search excerpt could be credited as a direct required read.",
      "paths": [
        "src/session/read-hook.ts",
        "src/cli/context-search.ts"
      ],
      "disposition": "fixed",
      "response": "The evidence test runs the real CLI formatter for text and JSON and checks both liveness and direct-read credit. The exact token cap test passed.",
      "condition": {
        "paths": [
          "src/session/read-hook.ts",
          "src/cli/context-search.ts",
          "src/context-search/output.ts",
          "src/context-search/engine.ts",
          "tests/session-evidence.test.ts",
          "tests/context-search-engine.test.ts",
          "dist/session/read-hook.d.ts",
          "dist/session/read-hook.js",
          "dist/session/read-hook.js.map",
          "dist/cli/context-search.d.ts",
          "dist/cli/context-search.js",
          "dist/cli/context-search.js.map",
          "dist/context-search/output.d.ts",
          "dist/context-search/output.js",
          "dist/context-search/output.js.map",
          "dist/context-search/engine.d.ts",
          "dist/context-search/engine.js",
          "dist/context-search/engine.js.map"
        ],
        "evidence": "Real text and JSON search results receive no read credit; an ordinary shell read is credited and the excerpt cap holds."
      },
      "conditionMet": "Focused Vitest suites passed 269 tests including the pinned Tantivy binding. Typecheck and compile passed. The evidence test runs the real CLI formatter for text and JSON and checks both liveness and direct-read credit. The exact token cap test passed."
    },
    {
      "id": "CTX-2",
      "severity": "substantive",
      "description": "An inherited provider ID could override the startup's explicit identity repair.",
      "paths": [
        "src/context-search/rollout.ts",
        "src/session/evidence.ts"
      ],
      "disposition": "fixed",
      "response": "Search and receipt evidence resolve the explicit hook ID first; tests also verify native-only resolution.",
      "condition": {
        "paths": [
          "src/context-search/rollout.ts",
          "src/session/evidence.ts",
          "tests/context-rollout-policy.test.ts",
          "tests/session-evidence.test.ts",
          "dist/context-search/rollout.d.ts",
          "dist/context-search/rollout.js",
          "dist/context-search/rollout.js.map",
          "dist/session/evidence.d.ts",
          "dist/session/evidence.js",
          "dist/session/evidence.js.map"
        ],
        "evidence": "Test conflicting explicit and native IDs and ordinary native-only resolution."
      },
      "conditionMet": "Focused Vitest suites passed 269 tests including the pinned Tantivy binding. Typecheck and compile passed. Search and receipt evidence resolve the explicit hook ID first; tests also verify native-only resolution."
    },
    {
      "id": "CTX-3",
      "severity": "substantive",
      "description": "The coverage report marked deleted and symlinked files as searchable.",
      "paths": [
        "src/context-search/sources.ts",
        "src/cli/context-search.ts"
      ],
      "disposition": "fixed",
      "response": "Coverage and source loading share an availability check; the Git fixture verifies exact paths and unmatched patterns.",
      "condition": {
        "paths": [
          "src/context-search/sources.ts",
          "src/cli/context-search.ts",
          "tests/context-search-sources.test.ts",
          "docs/runbooks/context-search.md",
          "dist/context-search/sources.d.ts",
          "dist/context-search/sources.js",
          "dist/context-search/sources.js.map",
          "dist/cli/context-search.d.ts",
          "dist/cli/context-search.js",
          "dist/cli/context-search.js.map"
        ],
        "evidence": "Test real tracked file, symlink and deleted file fixture."
      },
      "conditionMet": "Focused Vitest suites passed 269 tests including the pinned Tantivy binding. Typecheck and compile passed. Coverage and source loading share an availability check; the Git fixture verifies exact paths and unmatched patterns."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "/root/pilot_review",
      "commit": "1233d8a7dae217dcbf130c92f15e7a41f1932202",
      "scopeReason": "Late CI correction for missing ripgrep on the runner and the AGENTS.md and scaffolded guide startup byte limits.",
      "outcome": "cleared",
      "elapsedMinutes": 0.5333333333333333,
      "timing": {
        "source": "clock",
        "durationMs": 32000,
        "evidence": "Author clock observations bracketing invocation and delivery, 2026-11-07 22:35:09\u201322:35:41 UTC."
      },
      "summary": "Cleared the CI dependency provision and removal of startup text from stock guides. Reviewed actionlint and 21 focused tests with the pinned Tantivy binding. No findings."
    }
  ]
}
```
