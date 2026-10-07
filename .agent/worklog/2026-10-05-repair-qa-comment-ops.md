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

## GitHub Manager review — 2026-10-07

The GitHub Manager merged origin/main into the branch, which conflicted in docs/runbooks/qa-comments.md and the generated dist/cli/qa.js.map, so the author review no longer covered the head by a clean merge and the manager reviewed the change itself. The runbook conflict was resolved by keeping main's new shared iOS preview section (MO-26-10-06-15.17.01, where morpheus qa preview ios stop ends the overlay too) and keeping this branch's lifecycle and /health guidance, rescoped as "Standalone overlay lifecycle" for morpheus qa comments serve beside a preview Morpheus did not start, since the claim that stopping the preview never stops the overlay is no longer true of the managed preview. dist was regenerated with pnpm compile. The three source changes (exact loopback origins at the bound port, idempotent resolve preserving first audit stamps, empty webhook overrides) were reviewed against main's new callers (the preview supervisor starts the same overlay server, unaffected by the origin change) and each was mutation-checked: reverting any one of them fails tests/qa-comments.test.ts. No findings. typecheck, 1,670 tests across 60 files, compile (no dist drift) and pm index passed on the merged head. pnpm test:rules and anything needing macOS, a simulator or a live webhook were not run here.

That run's record cleared 9cd74cea879b448e23166bf3b847b1f2b7aff8ac (session https://github.com/cpheinrich/morpheus-gh-manager-ops/actions/runs/37554154733); it is superseded by the review below, because trunk moved again and the next integration needed another hand-resolved conflict.

## GitHub Manager review — 2026-10-07 (second session)

A second GitHub Manager session merged origin/main into the branch again: trunk had gained the web comment QA preview (MO-26-10-06-18.13.32, MO-26-10-06-22.17.47), which conflicted with this branch in docs/runbooks/qa-comments.md and the generated dist/cli/qa.js.map and dist/qa/serve.js.map, so the earlier manager clearance no longer covered the head and this session reviewed the merged change itself. The runbook conflict was resolved by keeping both sections in order: this branch's "Standalone overlay lifecycle" guidance for morpheus qa comments serve, then main's new "The web preview" section; dist was regenerated with pnpm compile rather than hand-merged. The three source changes were re-read against main's new code: the simulator overlay's exact loopback origin check at the bound port in src/qa/serve.ts is independent of the web overlay's own ownOrigins check in src/qa/web/server.ts; the empty-override behaviour of resolveWebhookConfig now also governs main's shared recordBatch path in src/qa/batches.ts, which is the intended per-process disable; and the idempotent resolveBatch in src/qa/store.ts is still the only resolve path. Each fix was mutation-checked on the merged head: reverting the localhost origin, the resolved early return, or the empty-override test each fails one test in tests/qa-comments.test.ts. No findings. typecheck, 1,719 tests across 61 files, compile (no dist drift) and pm index (no changes) passed on the merged head. pnpm test:rules and anything needing macOS, a simulator or a live webhook were not run here.

```morpheus-manager-review
{
  "version": 1,
  "managerSession": "https://github.com/cpheinrich/morpheus-gh-manager-ops/actions/runs/37611528561 (pull request 324)",
  "reviewed": "2930399e6cb39635207bfcd11b0f485e9e67f827",
  "covered": "2930399e6cb39635207bfcd11b0f485e9e67f827",
  "priorReview": {
    "state": "complete",
    "note": "Author review /root/review_qa_ops cleared a0805c600fe68174e7b2fb86b3773e45a17dda72 with no findings, and an earlier GitHub Manager session cleared 9cd74cea879b448e23166bf3b847b1f2b7aff8ac with no findings; neither covers the head once a further trunk integration needed a hand-resolved conflict."
  },
  "findings": [],
  "outcome": "cleared",
  "summary": "A second GitHub Manager session merged origin/main into the branch again: trunk had gained the web comment QA preview (MO-26-10-06-18.13.32, MO-26-10-06-22.17.47), which conflicted with this branch in docs/runbooks/qa-comments.md and the generated dist/cli/qa.js.map and dist/qa/serve.js.map, so the earlier manager clearance no longer covered the head and this session reviewed the merged change itself. The runbook conflict was resolved by keeping both sections in order: this branch's \"Standalone overlay lifecycle\" guidance for morpheus qa comments serve, then main's new \"The web preview\" section; dist was regenerated with pnpm compile rather than hand-merged. The three source changes were re-read against main's new code: the simulator overlay's exact loopback origin check at the bound port in src/qa/serve.ts is independent of the web overlay's own ownOrigins check in src/qa/web/server.ts; the empty-override behaviour of resolveWebhookConfig now also governs main's shared recordBatch path in src/qa/batches.ts, which is the intended per-process disable; and the idempotent resolveBatch in src/qa/store.ts is still the only resolve path. Each fix was mutation-checked on the merged head: reverting the localhost origin, the resolved early return, or the empty-override test each fails one test in tests/qa-comments.test.ts. No findings. typecheck, 1,719 tests across 61 files, compile (no dist drift) and pm index (no changes) passed on the merged head. pnpm test:rules and anything needing macOS, a simulator or a live webhook were not run here."
}
```
