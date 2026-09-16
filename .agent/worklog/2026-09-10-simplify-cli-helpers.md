---
roadmap: MO-26-09-10-21.37.20
---
# Complete medium and low audit findings

Split the executable into a process boundary, importable invocation seam, argument parser,
help text, and one dispatcher per command family. Scalar/boolean option tables replace
the repetitive switch while preserving special consumption rules. Added 146 compatibility
cases for options, all command families, error text, help precedence and provisioning gates.

Consolidated seven identical accessibility probes, two best-effort JSON readers, two strict
optional-content readers, two scaffold writers and two markdown table renderers. Explicitly
preserved the review-context reader's catch-all policy and CLI PM's stat-based probe: those
look similar but do not share the same error contract. Empty-table text remains caller-owned.
Added four real-filesystem/format tests covering missing vs unreadable content, invalid JSON,
preserved files, write errors, bookkeeping, escaping and both empty states.

The exact-worktree index was installed, but MCP transport repeatedly closed; direct source
inspection was used instead of treating graph absence as evidence. Commander was considered
and rejected for this compatibility-preserving refactor; no dependency was added.

Validation: typecheck, 45 files / 1,294 tests, compile and PM index passed. Existing subprocess
Firebase CLI tests and scaffold/PM/review/heartbeat consumers run in that full suite.

A deterministic 10,000-case differential comparison against the original parser matched exactly.

Independent review found one minor unused import left by scaffold extraction. The author removed it and regenerated output. The single same-session follow-up cleared that fix and integration of the workflow and dependency updates, with no new findings. All278 focused CLI/helper/workflow tests passed; the author full suite passed1295 tests. Graph metadata was stale, so both reviews used current source and diffs.

```morpheus-review
{
  "version": 1,
  "base": "1e419856ce104d76e6f3c6791ac8be13d870d3ce",
  "reviewed": "5e02b5c90c7f3a4d655b48b4faf314b08ae2d8ed",
  "covered": "657c96162573a27245926a4aea4c1b74136c4483",
  "authorSession": "01a08ebe-1af7-7493-9b34-1b53207ffd21",
  "reviewerSession": "/root/review_cli",
  "risk": "normal",
  "elapsedMinutes": 7,
  "outcome": "complete",
  "summary": "Independent review found one minor unused import left by scaffold extraction. The author removed it and regenerated output. The single same-session follow-up cleared that fix and integration of the workflow and dependency updates, with no new findings. All278 focused CLI/helper/workflow tests passed; the author full suite passed1295 tests. Graph metadata was stale, so both reviews used current source and diffs.",
  "findings": [
    {
      "id": "CLI-1",
      "severity": "minor",
      "description": "Unused accessible-as-exists import after extracting scaffold writer.",
      "paths": [
        "src/web/scaffold.ts",
        "dist/web/scaffold.js",
        "dist/web/scaffold.js.map"
      ],
      "disposition": "fixed",
      "response": "Removed the unused import and regenerated compiled artifacts; reviewer independently confirmed the author-reported lint observation and cleared the fix."
    }
  ],
  "followUp": {
    "reviewerSession": "/root/review_cli",
    "commit": "657c96162573a27245926a4aea4c1b74136c4483",
    "base": "df5c26a25ccfc2655c06bce2aaec7019f097509b",
    "scopeReason": "Integrate merged workflow hardening and dependency updates and verify the minor import fix.",
    "outcome": "cleared",
    "elapsedMinutes": 2,
    "summary": "Minor fix cleared; imported workflows and dependencies match trunk;278 focused tests passed."
  }
}
```
