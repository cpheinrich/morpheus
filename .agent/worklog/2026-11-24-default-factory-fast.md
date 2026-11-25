---
roadmap: MO-26-11-24-23.36.49
tags: [engineering, devops, factory]
---

# Default Codex Factory workers to Fast

The local Factory launcher accepted an explicit Fast request for its enrolled
Codex worker. A fresh bounded run completed, and the gateway usage entry
matched the model, request window, and token counts. The gateway recorded the
Fast request as priority processing through the OpenAI subscription route.
This qualified the existing override before changing the default.

The shared rollout covers the enrolled Factory projects. Claude stays at
Standard. The operator rollout record tracks host upgrades, effective speed
probes, and activation prerequisites.

## Governing records

- [Gateway binding and speed isolation](./2026-11-07-bind-factory-gateway-workers.md)
- [Earlier Codex worker default update](./2026-11-17-upgrade-factory-codex-default.md)
