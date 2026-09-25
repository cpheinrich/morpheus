---
agent: codex
date: 2026-09-25
roadmap: MO-26-09-25-07.08.04
outcome: review
---

# XCTest worker device set

The full native Evo run (36144713253) exposed a gap in #267: default simctl listed the
owned base as Shutdown while the tests were active. `simctl --set testing list devices`
showed two booted `Clone N of Morpheus CI <UUID>` workers under XCTestDevices. The earlier
native smoke created its worker-name device in the default set, so it could not prove this
boundary. Reopened #266 and corrected the actual device-set handling in this follow-up.

Cleanup now inventories both sets and carries each set's selector into shutdown/delete.
Failure in one set does not prevent attempts in the other. Ownership remains exact and
unrelated booted simulators are untouched. Added a split-inventory regression and a test
that failure to list the default set still allows private worker cleanup.

## Validation

- Eight focused Node tests passed.
- Native smoke creates an owned base and a real private-set worker under github-runner,
  boots that worker, cleans both sets twice, and verifies existing nightly/PR devices.
- `pnpm typecheck && pnpm test && pnpm compile` is run before PR delivery.
- Source fallback: graph MCP is not exposed. Bounded scope is the existing action, its
  direct reusable-workflow caller and device-set behavior observed on the Mac mini.

## Independent review

Independent review cleared the both-device-set correction with no findings. Eight focused tests passed and native testing-set JSON parsing was checked. Author native smoke timed out during worker data migration, then successfully removed the owned base and private worker; repeated cleanup confirmed both absent while unrelated nightly/PR workers remained booted. This proves cleanup after setup failure, not successful worker readiness. Full typecheck, 1,381 tests and compile passed.

```morpheus-review
{
  "version": 1,
  "base": "cc2c1e518f87c8fadd30b1058f660187302d8039",
  "reviewed": "46323d47b47f4eaeb2a8db55ebc6a3a3ea22650c",
  "covered": "46323d47b47f4eaeb2a8db55ebc6a3a3ea22650c",
  "authorSession": "01a0d8cb-5b59-7261-978f-19fd9976dc80",
  "reviewerSession": "01a0d8e7-e32e-75d3-ad94-f0d8772b3b2e",
  "risk": "high",
  "elapsedMinutes": 3,
  "outcome": "complete",
  "summary": "Independent review cleared the both-device-set correction with no findings. Eight focused tests passed and native testing-set JSON parsing was checked. Author native smoke timed out during worker data migration, then successfully removed the owned base and private worker; repeated cleanup confirmed both absent while unrelated nightly/PR workers remained booted. This proves cleanup after setup failure, not successful worker readiness. Full typecheck, 1,381 tests and compile passed.",
  "findings": []
}
```
