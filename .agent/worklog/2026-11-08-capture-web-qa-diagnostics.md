---
date: 2026-11-08
roadmap: MO-26-11-08-01.38.38
agent: codex
tags: [engineering]
---

# Capture web QA build and view diagnostics

Extend the existing pin context with browser and OS families, pixel ratio, effective
CSS scheme, and the build identity declared by the preview operator. The active
view can opt in with a bounded flat snapshot of values it explicitly exposes.
Both sections freeze at the click and survive draft reload and Send. The old
context shape stays readable. Invalid optional view metadata is ignored at
capture. Posted diagnostics are also checked at the shared batch boundary.

Reused the existing pin capture, preview configuration and Zod validation.
Coarse classification needs only a few known browser/OS family patterns.
No dependency or new service is needed. App build identity remains unavailable
when the operator cannot verify the identity of what the preview serves.

## Validation

- 101 focused unit tests passed across web context, batch, preview lifecycle and readiness.
- New Chromium and WebKit fixtures verified frozen diagnostics through reload and Send.
  Both also verified usable pins with missing, invalid, private or out-of-view metadata.
- Typecheck, compile, PM index and diff whitespace passed. The complexity gate passed
  with an advisory for the existing `qaEndpoint` handler.
