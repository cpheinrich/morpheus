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
