---
agent: codex
date: 2026-11-02
outcome: review
tags: [engineering, security]
---

# Factory installed runtime dependency advisories

## Outcome

Refreshed the existing Factory dependency PR rather than creating a duplicate. The installed
production dependency graph now resolves the MCP SDK, Zod, body-parser, Hono/node-server,
ip-address, qs, and fast-uri to patched releases. Application source and runtime configuration
are unchanged.

Factory imports the MCP SDK's stdio transport only. It does not import the affected HTTP, OAuth,
bearer-auth, task-session, or task-store paths, so the SDK advisory updates are installed-graph
remediation and preventive hygiene rather than evidence of a reachable Factory exploit.

## Validation

- `pnpm --dir plugins/factory install --frozen-lockfile --ignore-workspace`
- `pnpm --dir plugins/factory test --ignore-workspace` — 134 passed
- `node plugins/factory/scripts/check.mjs`
- `pnpm --dir plugins/factory audit --prod --ignore-workspace` — no known vulnerabilities
- Exact-head CI passed, including the Factory and Node checks.

## Independent review

Fresh normal-risk independent review cleared bcb6900e with no substantive findings. Minor note RPT-001 corrected the PR body to describe the MCP SDK fixes as installed production-graph remediation: Factory uses stdio only and does not call the affected HTTP, OAuth, bearer-auth, task-session, or task-store surfaces. The reviewer verified 134 tests, the Factory boundary check, frozen install, a clean production audit, and green exact-head CI.

```morpheus-review
{
  "version": 2,
  "base": "ae147cb6a1c296c239a4d25098c3211d1f6c6f25",
  "reviewed": "bcb6900e028cf28e4a220314016013db4698e37b",
  "covered": "bcb6900e028cf28e4a220314016013db4698e37b",
  "authorSession": "01a19d36-6284-7243-80d0-3e77f6a34d9e",
  "reviewerSession": "/root/morpheus576_review",
  "risk": "normal",
  "elapsedMinutes": 4.217083333333333,
  "timing": {
    "source": "clock",
    "durationMs": 253025,
    "evidence": "Observed reviewer turn clock: start 1793644512456 ms, end 1793644765481 ms."
  },
  "outcome": "complete",
  "summary": "Fresh normal-risk independent review cleared bcb6900e with no substantive findings. Minor note RPT-001 corrected the PR body to describe the MCP SDK fixes as installed production-graph remediation: Factory uses stdio only and does not call the affected HTTP, OAuth, bearer-auth, task-session, or task-store surfaces. The reviewer verified 134 tests, the Factory boundary check, frozen install, a clean production audit, and green exact-head CI.",
  "findings": [
    {
      "id": "RPT-001",
      "severity": "minor",
      "description": "The PR body implied Factory runtime exposure to the SDK task-session, memory-exhaustion, redirect, and bearer-auth advisories even though Factory imports only the stdio transport and the affected HTTP, OAuth, auth, and task-store controls are opt-in.",
      "paths": [
        "plugins/factory/package.json",
        "plugins/factory/pnpm-lock.yaml"
      ],
      "disposition": "fixed",
      "response": "Reworded the PR body to distinguish installed production-graph remediation from reachable exploitation, explicitly naming Factory's stdio-only use and lack of callers for the affected SDK surfaces."
    }
  ]
}
```
