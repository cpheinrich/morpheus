---
roadmap: MO-26-10-12-12.24.34
---
# Detect web preview exit during readiness

Confirmed the original loop inspected only HTTP health and could wait360 iterations after the
launchd job exited. It now checks job liveness first, permits pending first launches, and surfaces
a bounded20-line/8KiB log tail on exit or readiness timeout. The supervisor also catches a child
that exited while its overlay was binding, before the exit listener was attached.

Added executable cases for missing/nonzero/zero/signal exits, pending then ready, live but
unhealthy360-attempt boundary, cancellation and a real Node child that exits23. Focused83tests
across qa-web-readiness/qa-web/qa-preview pass. Domain-specific changes reuse existing launchctl
and Node filesystem interfaces, with no dependency. Graph unavailable; exact source inspected.

Native macOS launchd reproduction: a temporary checkout ran a Node dev command exiting23.
Start failed in0.535seconds with supervisor exit1 and the actual fixture's failure/exit23 log
lines, then removed its job/state and stopped the owned preview. No unrelated preview touched.
Typecheck, compile, pm index, lint, inbox and diff checks passed.

After merging currentmain, full `pnpm test` passed2120tests across77files in69.07seconds.

Review WEB-EXIT-1 found launchd's actual pending sentinel `last exit code = (never exited)`
was mistaken for completion. Under the reviewer's exact-path condition, the author restricted
exit/signal matching to numeric values and added pending-sentinel and ran-without-status cases.
All84 focused QA tests, typecheck and compile passed; no extra review turn required.
