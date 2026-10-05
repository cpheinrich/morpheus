---
agent: codex
date: 2026-10-05
roadmap: MO-26-10-05-12.30.30
outcome: review
---

# Repair QA comment operator reliability

Issue #316 reproduced three failures: localhost requests returned 403, repeated resolution
replaced the original audit stamps, and an empty webhook override fell back to the root file.
The three regression tests failed before the fix and now pass. Requests accept the two exact
HTTP loopback origins at the bound overlay port; cross-site, wrong-port, wrong-protocol,
lookalike hosts and null origins still refuse without creating batches. A second resolve returns
the existing record with unchanged bytes. Empty/whitespace webhook URLs suppress root-level
waking for that process, and an empty authorization override clears the file value.

The CLI now matches the existing missing-stream message. The runbook states the webhook's
per-root scope and separate overlay/preview lifecycles, including safe port diagnosis. The
health endpoint remains process/configuration health; the documentation explicitly requires
confirming live app pixels and does not claim it probes upstream. No rendered page changed.
This extends existing domain code, with no new generic capability or dependency.

Frozen install, typecheck, 1,628 tests in 59 files, compile, PM index, lint, inbox validation
and diff checks passed. Real HTTP requests and on-disk records cover the affected flow;
no real webhook or simulator interaction was used or required for these server/CLI changes.
Generated outputs are included. The claim also marks the already-merged iOS scope item shipped.

Graph limitation: exact-checkout bootstrap check/repair and graph access refused because an
active pre-coordination CBM generation could not be safely stopped. No other session was
interrupted. Direct source covered qa/store.ts, serve.ts, webhook.ts, cli/qa.ts, the overlay's
existing message, complete tests/qa-comments.test.ts, and docs/runbooks/qa-comments.md.

Independent review is pending.
