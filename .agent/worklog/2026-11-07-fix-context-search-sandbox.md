---
date: 2026-11-07
agent: codex
roadmap: MO-26-11-07-15.41.07
tags: [engineering, devops, agent-workflow]
outcome: implemented
summary: "Make Tantivy work in sandboxed sessions and support explicit engine selection."
---

Tantivy opens a lockfile when it opens a read index. The workspace sandbox
rejects those writes under Git metadata and also rejects query trace appends
there. Use ignored workspace storage for generated indexes, traces, and
session engine pins. Keep startup policy independent from a search pin.

Compile and typecheck passed. All 177 focused tests passed with Tantivy
0.27.0. The complexity check passed with cognitive advisories. A macOS
Codex workspace-write probe forced Tantivy in an assigned ripgrep session,
built and reused the index, cited the expected worklog, and restored the
assigned engine. A fresh Evo desktop task ran both candidate CLI queries
with Tantivy cache hits and the expected citation, then cleared the pin.

## Independent review

Independent review cleared sandboxed Tantivy after cleanup, optional pin and trace hardening.

The follow-up passed 201 focused tests. After the narrowly scoped cleanup condition, compile, typecheck and all 25 cleanup tests passed.

```morpheus-review
{
  "version": 2,
  "base": "b3880ab6150c05b5e5a86017b2fb84a05c3dc94c",
  "reviewed": "162f00e28842eb9a6b71df9d0f535a509b0d4204",
  "covered": "8188d45531e80242dad8aed091b7c2b2392c99b2",
  "authorSession": "01a1b4d0-b0d9-7cd1-9f03-33349cd7f590",
  "reviewerSession": "/root/sandbox_fix_review",
  "risk": "normal",
  "elapsedMinutes": 1.7666666666666666,
  "timing": {
    "source": "clock",
    "durationMs": 106000,
    "evidence": "Invocation and reviewer clock endpoint 23:44:46\u201323:46:32 UTC."
  },
  "outcome": "complete",
  "summary": "Independent review cleared sandboxed Tantivy after cleanup, optional pin and trace hardening.",
  "findings": [
    {
      "id": "SANDBOX-S1",
      "severity": "substantive",
      "description": "Generated search state prevented normal cleanup.",
      "paths": [
        "src/pm/cleanup.ts"
      ],
      "disposition": "fixed",
      "response": "Archive ignored search state after removal proofs. Guard tracked descendants and preserve unrelated ignored data.",
      "condition": {
        "paths": [
          "src/pm/cleanup.ts",
          "dist/pm/cleanup.js",
          "dist/pm/cleanup.js.map",
          "tests/worktree-cleanup.test.ts"
        ],
        "evidence": "Run compile, typecheck and full focused cleanup tests covering clean tracked, narrowly ignored and unrelated ignored state."
      },
      "conditionMet": "Compile, typecheck and all 25 cleanup tests passed, including each required boundary."
    },
    {
      "id": "SANDBOX-S2",
      "severity": "substantive",
      "description": "Malformed or tracked pin state could interrupt or silently override searches.",
      "paths": [
        "src/context-search/local-state.ts"
      ],
      "disposition": "fixed",
      "response": "Treat inaccessible and non-ignored optional pin state as absent, verified in a real Git fixture."
    },
    {
      "id": "SANDBOX-S3",
      "severity": "substantive",
      "description": "A FIFO could block a trace append indefinitely.",
      "paths": [
        "src/context-search/rollout.ts"
      ],
      "disposition": "fixed",
      "response": "Open nonblocking and append only to a regular file. Compiled FIFO probe returned under its three-second timeout."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "/root/sandbox_fix_review",
      "commit": "d99035cd6d5f5ef6ba91a98095798f64e9c93625",
      "outcome": "cleared",
      "elapsedMinutes": 0.6833333333333333,
      "timing": {
        "source": "clock",
        "durationMs": 41000,
        "evidence": "Invocation and reviewer clock endpoint 23:47:16\u201323:47:57 UTC."
      },
      "summary": "Cleared invalid pins and FIFO safety. Conditionally cleared cleanup subject to tracked and narrowly ignored path proofs."
    }
  ]
}
```
