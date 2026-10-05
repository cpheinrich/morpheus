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

Independent reviewer /root/review_qa_ops completed and cleared exact head a0805c600fe68174e7b2fb86b3773e45a17dda72 with no findings at high risk because the origin authorization boundary changed. The reviewer verified loopback acceptance and unrelated-origin refusal, unchanged audit bytes on repeated resolution, empty overrides, CLI/runbook consistency, generated-source parity, and the already-merged roadmap reconciliation. All 18 focused tests and diff checks passed; the checkout remained clean. Graph tools were unavailable, so direct source and caller inspection supplied the evidence.

```morpheus-review
{
  "version": 2,
  "base": "2dffd277eee14832b88488e20bc8ffecb46e63b1",
  "reviewed": "a0805c600fe68174e7b2fb86b3773e45a17dda72",
  "covered": "a0805c600fe68174e7b2fb86b3773e45a17dda72",
  "authorSession": "01a10d70-d792-73d1-92b1-2350f0a012fe",
  "reviewerSession": "/root/review_qa_ops",
  "risk": "high",
  "elapsedMinutes": 2.5,
  "timing": {
    "source": "clock",
    "durationMs": 150000,
    "evidence": "Author clock immediately before spawn 2026-10-05 19:35:40 UTC; first author clock observing returned result 2026-10-05 19:38:10 UTC. Reviewer final actual clock 19:37:48 UTC. Complete invocation through author observation is 150000 ms including tools; no workload estimate."
  },
  "outcome": "complete",
  "summary": "Independent reviewer /root/review_qa_ops completed and cleared exact head a0805c600fe68174e7b2fb86b3773e45a17dda72 with no findings at high risk because the origin authorization boundary changed. The reviewer verified loopback acceptance and unrelated-origin refusal, unchanged audit bytes on repeated resolution, empty overrides, CLI/runbook consistency, generated-source parity, and the already-merged roadmap reconciliation. All 18 focused tests and diff checks passed; the checkout remained clean. Graph tools were unavailable, so direct source and caller inspection supplied the evidence.",
  "findings": []
}
```
