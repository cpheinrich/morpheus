---
date: 2026-11-21
roadmap: MO-26-11-21-00.05.31
tags: [engineering, qa]
summary: Capture a redacted image and browser diagnostics for each live website QA pin.
---

# Capture live web QA screenshots and diagnostics

The prior production contract contained placement geometry and an optional explicit anchor.
The shared component now freezes a redacted viewport and bounded browser data at placement,
keeps them with the draft, and sends the same payload when a receipt is lost. The two host
adapters write an indexed evidence document per pin in the batch commit. Capture failure is
shown in the pin list, and text can still be submitted.

Reused the project's pinned modern-screenshot package to rasterize an inert snapshot. The
projection omits external styles and unsupported media and uses the existing private marker.
No new dependency is needed. Two browser engines exercise pick-time pixels, copy masking,
failure feedback, and byte-identical retry.

The first delegated implementation ended after interrupted supervision with verified cleanup
and no patch. The retry returned a checksum-verified patch from the exact published claim.
Local verification found that headless Chromium reports `HeadlessChrome` in the user agent.
The parser now retains that browser family and its version. The controller also factored
image validation and capture helpers to satisfy the repository's enforced complexity limit.
