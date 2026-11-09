---
date: 2026-11-04
roadmap: MO-26-11-04-18.31.58
tags: [engineering, factory]
---

# Refresh Claude Factory quota

The user reported an agent mistaking an old full Claude five-hour window for current quota.
Source inspection confirmed the risk: every inspection fetched the gateway account list,
but those counters were stored provider snapshots, and Claude's five-hour reset was set to
null. There was no local Factory cache to clear. The value could remain counted indefinitely.

The repair uses the gateway's existing per-account active usage read for Claude only,
honors returned reset times, evaluates them after network waits, and reports the gateway's
timestamp. Failed reads stay unknown; they never reuse stored Claude counters. Requests
have native 15-second timeouts. No new service, polling loop, dependency, age gate, retry
policy or configuration was added.

The first implementation refreshed both providers. A closer check of upstream
[getOpenAIUsage](https://github.com/Wei-Shaw/sub2api/blob/main/backend/internal/service/account_usage_service.go)
showed that forcing Codex can send a synthetic model probe and that even an old fallback
snapshot receives a current response timestamp. Before review, the implementation was
narrowed to Claude. Codex retains its canonical stored counters and reset handling, and
reports `codex_usage_updated_at` so its actual snapshot age is visible. This avoids model
requests merely to inspect quota. The prior diagnostic comparison did invoke the supported
refresh endpoint for both providers once before that behavior was identified; subsequent
verification requests only Claude usage.

The existing [gateway client API](https://github.com/Wei-Shaw/sub2api/blob/main/frontend/src/api/admin/accounts.ts)
supplies `source=active&force=true`; no provider-specific OAuth reader or new package is
needed. Claude's gateway may still use its short upstream cache (about three minutes), and
its reported update timestamp is not guaranteed to be the provider's actual measurement
time. The change prevents indefinite reuse of the stored five-hour value; it does not
promise instantaneous provider telemetry or solve Codex's upstream snapshot freshness.

## Execution and verification

Implementation used the Factory Claude gateway on this device, with its configured Opus
fallback and medium effort. Gateway runs: `f06dc621-1757-4469-b700-792bb6b103a3` and
`ba32a22d-1cbd-4ddb-8e77-64fa07f28479`; native worker session
`30d5a0a0-6780-4534-a99a-30af3b632ae1`. The root remained coordinator and verifier.
The worker needed one routine scope clarification to update the directly dependent fake
gateway fixture. Root authorized that test-only ownership expansion, with no new provider
or business authority.

- Worker focused suite: `node --test tests/config.test.mjs tests/manager.test.mjs tests/gateway-workers.test.mjs`
  passed 30 tests; plugin `node scripts/check.mjs` passed.
- Root checked the actual implementation and performed a live read through it: exactly
  login, account list and one Claude usage GET; no Codex usage request. Both providers'
  readings and reported timestamps were returned.
- `pnpm typecheck`, `pnpm compile`, `pnpm morpheus pm index` passed with no generated drift.
- `pnpm exec vitest run tests/factory-distribution.test.ts`: 3 passed.
- Root full plugin regression: `pnpm test` in `plugins/factory` passed 183/183.
- Independent review and final CI evidence follow below.
- No local root full-suite rerun: shared core is unchanged; CI owns integration coverage.

## Open questions

None for this scoped repair. Codex freshness remains an explicit upstream snapshot limit.

## Independent review

Independent high-risk review cleared the quota repair with no substantive findings. One minor note about burst usage reads was declined: the gateway retains its short Claude cache, failures already remain unknown, and this scoped repair adds no client refresh cache or new setting. The reviewer independently passed all 21 config tests.

Fresh review used the same configured Claude gateway in a separate native conversation,
run `de6ad1e9-c4ce-46ed-a325-d51dc5d2f356`; implementation history was not inherited.

```morpheus-review
{
  "version": 2,
  "base": "de6ecbea2e0bef03ae60faec2a991d6173e00d23",
  "reviewed": "cca0350e0227b7e19adf5ecf62704e72caee9d7e",
  "covered": "cca0350e0227b7e19adf5ecf62704e72caee9d7e",
  "authorSession": "01a1a323-9ec6-7bd0-b4de-60f94f19ef54",
  "reviewerSession": "76d72578-a2c5-44ea-9fdc-34f5a6ff6eea",
  "risk": "high",
  "elapsedMinutes": 1.20495,
  "timing": {
    "source": "clock",
    "durationMs": 72297,
    "evidence": "Root clock around fresh Factory reviewer run de6ad1e9-c4ce-46ed-a325-d51dc5d2f356: 2026-11-05T02:40:59.457Z to 2026-11-05T02:42:11.754Z. Native session 76d72578-a2c5-44ea-9fdc-34f5a6ff6eea; all invocation waits included."
  },
  "outcome": "complete",
  "summary": "Independent high-risk review cleared the quota repair with no substantive findings. One minor note about burst usage reads was declined: the gateway retains its short Claude cache, failures already remain unknown, and this scoped repair adds no client refresh cache or new setting. The reviewer independently passed all 21 config tests.",
  "findings": [
    {
      "id": "R1-burst",
      "severity": "minor",
      "description": "Repeated force=true usage reads could cause upstream rate limiting if a gateway version bypasses its own Claude cache.",
      "paths": [
        "plugins/factory/src/config.mjs"
      ],
      "disposition": "disputed",
      "response": "Retain the existing active-read API as requested. Inspected upstream Claude usage path retains its three-minute cache even with this request; failures already report unknown. No observed burst problem justifies another client cache, retry or setting in this simple fix."
    }
  ]
}
```

