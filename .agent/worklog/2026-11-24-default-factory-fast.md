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

The controller matched the private implementation patch to its Fleet
receipt and verified it against the published source before applying it.
The first focused pass ran 101 tests across local gateways, reverse
delegation, Fleet workspace and source binding, and the unattended launcher.
Four additional Factory distribution tests passed. Typecheck, compilation,
and PM indexes passed. The complexity check passed with an advisory on
the existing Fleet controller dispatch function.

Existing standalone Codex jobs also use the shared gateway worker.
Their private configuration can select Fast for a fresh job. A continuation
retains its original speed and session home, and legacy jobs default to
Standard. The controller matched the supplemental patch to its independent
Fleet execution receipt before applying it.

## Review corrections

The independent review found three speed-intent defects. Local continuations
now read speed from the matching Codex session. Fleet rejects a conflicting
reply speed before posting an answer, and a conflicting stable-ID retry
returns HTTP 409 so the client can report the error without retrying. Six
controller-run focused tests cover the corrections.

The follow-up identified a Fast session that could lose its saved speed when
recent run history was trimmed. The bridge now records the speed with the
confirmed Codex session. The regression reproduces history trimming before
resuming the original session, with the worker default reset to Standard.

CI exercised an older run record with no selection object. The author
restored the Standard fallback for that record. The separate artifact
transport job reported a missing fixture immediately after upload. A later
download returned both expected files and their exact digests.

## Governing records

- [Gateway binding and speed isolation](./2026-11-07-bind-factory-gateway-workers.md)
- [Earlier Codex worker default update](./2026-11-17-upgrade-factory-codex-default.md)
