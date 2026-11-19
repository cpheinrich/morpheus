---
roadmap: MO-26-11-17-21.09.17
tags: [engineering, devops, factory]
---

# Upgrade the Factory Codex worker default

Both local Factory controller paths select GPT-6.2 Sol at High effort,
with Standard speed. A Codex gateway launch from a controller without
reasoning uses the new default. An explicit Low override reaches the
resumed worker. The focused gateway, manager and config suites passed
all 38 tests. Typecheck, compile, PM indexes and the scoped complexity
check passed.

The first live override canary reached the subscription gateway, which
refused the model because it was absent from the Codex account model map.
Delivery also needs the exact model admitted by the gateway and verified
in the Evo Fleet enrollment and its two executor configurations.

The gateway account now admits the exact model name. A second desktop canary
completed and the gateway recorded the requested and upstream model as
GPT-6.2 Sol with High reasoning. The Evo Fleet enrollment and both execution
configurations were updated. A new task selected the model without an override
and completed on Studio through the existing gateway.

## Independent review

The independent reviewer conditionally cleared the implementation. They found that the Claude controller path lacked a regression and that the README still described inherited effort for Codex gateway workers. The author added the Claude-root launch and override assertions and corrected the README. The four focused Factory suites and diff checks passed.

```morpheus-review
{
  "version": 2,
  "base": "0a1f75ceb9bf1ad00819805a230b1c34b9df07ee",
  "reviewed": "744c41d86f6c40bb5f1976f3925623e686744591",
  "covered": "3b55425e766629371386f285b296a27c6b0e297c",
  "authorSession": "01a1ecf5-d6f4-7092-97a2-4e56ec56e575",
  "reviewerSession": "01a1ed19-6e3e-7722-b2cb-eb92acee86d0",
  "risk": "normal",
  "elapsedMinutes": 4.163133333333334,
  "timing": {
    "source": "clock",
    "durationMs": 249788,
    "evidence": "Controller UTC readings at dispatch 2026-11-18T05:20:26.641Z and terminal observation 2026-11-18T05:24:36.429Z for Factory run 44d9dada-2280-445d-8771-f0d7fa7648a8."
  },
  "outcome": "complete",
  "summary": "The independent reviewer conditionally cleared the implementation. They found that the Claude controller path lacked a regression and that the README still described inherited effort for Codex gateway workers. The author added the Claude-root launch and override assertions and corrected the README. The four focused Factory suites and diff checks passed.",
  "contextRead": [
    "AGENTS.md",
    "CLAUDE.md",
    ".agent/context-core.md",
    ".agent/decisions.md",
    "architecture.md",
    "docs/runbooks/independent-review.md",
    "docs/runbooks/test-quality.md",
    "hq/product/roadmap/MO-26-11-17-21.09.17-upgrade-factory-codex-default.md",
    "hq/product/roadmap/MO-26-11-02-20.13.38-normalize-codex-worker-effort.md",
    "hq/product/roadmap/MO-26-11-07-07.35.26-bind-factory-gateway-workers.md",
    ".agent/worklog/2026-11-07-bind-factory-gateway-workers.md",
    ".agent/worklog/2026-11-17-upgrade-factory-codex-default.md",
    "plugins/factory/README.md"
  ],
  "findings": [
    {
      "id": "F-01",
      "severity": "substantive",
      "description": "Existing tests could pass if a Claude controller continued to pass its own Low effort to the default Codex worker.",
      "paths": [
        "plugins/factory/tests/gateway-workers.test.mjs",
        "plugins/factory/tests/reverse.test.mjs",
        "plugins/factory/src/service.mjs"
      ],
      "disposition": "fixed",
      "response": "Changed the Claude-to-Codex guardian test to launch through the provider-neutral Factory entry point and check effective Codex argv on the default and overridden turns.",
      "condition": {
        "paths": [
          "plugins/factory/tests/reverse.test.mjs"
        ],
        "evidence": "Exercise factoryDelegate from a Low-effort Claude controller and assert GPT-6.2 Sol at High in argv. Assert an explicit alternative model and effort are forwarded. Run the three scoped suites and reverse.test.mjs."
      },
      "conditionMet": "The Claude-root guardian test asserts GPT-6.2 Sol + High and the resumed turn asserts GPT-6.1 Terra + Medium. node --test --test-reporter=dot plugins/factory/tests/{gateway-workers,manager,config,reverse}.test.mjs passed (59 tests)."
    },
    {
      "id": "F-02",
      "severity": "substantive",
      "description": "The same-provider gateway section incorrectly told readers that Codex workers inherit the controller's effort.",
      "paths": [
        "plugins/factory/README.md"
      ],
      "disposition": "fixed",
      "response": "Documented the effective Factory selection and explicit overrides in the gateway section.",
      "condition": {
        "paths": [
          "plugins/factory/README.md"
        ],
        "evidence": "Correct the same-provider gateway section and run git diff --check."
      },
      "conditionMet": "The section names GPT-6.2 Sol at High and explicit overrides. git diff --check passed."
    }
  ]
}
```
