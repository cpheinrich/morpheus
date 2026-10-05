---
agent: codex
date: 2026-10-05
roadmap: MO-26-10-05-12.17.00
outcome: review
---

# Respect nightly runtime and waiting releases

Issue #312 matches the current source: a fixed four-hour ceiling measured every unfinished
run from original creation, including reruns and releases queued behind a live predecessor.
Live Evo main's ios-nightly-build.yml grants 180 minutes each to testing and upload; its policy
adapter has no runtime override. The shared module now accepts runTimeoutMinutes, default 240,
with positive safe-integer validation. Apps set it above their sequential job ceilings plus
scheduling/preflight margin. Running attempts use run_started_at when available, retaining
created_at for older adapters. Queued/pending/requested runs wait while another release is
in_progress, but an overdue running predecessor still fails and an idle queue retains its limit.
No active run can enable a second dispatch, and upload uncertainty still refuses admission.

Twelve new/updated tests failed before implementation. Tests now pin the six-hour boundary
at exactly zero and one millisecond over, old reruns, all three queue statuses, a stuck
predecessor and idle queue, invalid timeouts and invalid active timestamps. The first green
attempt caught a fixture expectation assigning a pre-Pacific-midnight run to today's bucket;
the expected unchanged state was corrected, preserving the existing calendar policy.

Frozen install, typecheck, all 1,636 tests in 59 files, compilation, PM index, lint, inbox
validation and diff checks passed before trunk integration. Compiled outputs are included.
No generic scheduler or dependency was introduced; this extends existing domain admission rules.

The GitHub REST workflow-run schema documents run_started_at and the queue statuses:
https://docs.github.com/en/rest/actions/workflow-runs
Live Evo run 37249060039 attempt 2 has created_at 2026-10-05T00:50:31Z and run_started_at
2026-10-05T02:16:26Z, confirming current-attempt timing differs from original creation.
Consumer adoption is already tracked in Evo EV-26-10-01-13.30.14. This Morpheus change does not
re-vendor or activate the host adapter, dispatch a release, or touch signing credentials.

Graph limitation: bootstrap check/repair and search_graph/coverage queries refused an active
pre-coordination CBM generation. No other session was interrupted. Direct source reads covered
nightly-core.ts, its complete tests, the architecture contract and live Evo adapter/workflow.
No graph freshness or completeness is claimed.

Independent review is pending.
