---
roadmap: MO-26-09-09-07.30.03
date: 2026-09-09
agent: codex
---

# Recover delayed nightly iOS schedules

Evo build 1.0.1 (7), run 34304443924, started at 02:44 UTC from f0306d7.
Onboarding PR #189 merged at 03:27 UTC, so that build necessarily lacks it.
At 14:28 UTC September 9 no schedule event existed; the workflow is active and
06:00 America/Los_Angeles is valid. Recent cron runs arrived at 10:11 and 11:11
Pacific, so this is missing/delayed dispatch, not an unavailable macOS runner.
GitHub documents cron delays and dropped events during load. Internal queue
causality is not observable via the repository API.

Keep 06:00 and add 06:17–09:17 hourly retries in Evo and Kairos. Shared logic
skips same-day exact-source captures only with successful, unexpired artifacts;
release diffing still decides upload. An explicit no-op artifact prevents the
observer from erasing the previous gallery. This mitigates missed daily triggers
but cannot promise an exact start time from GitHub's best-effort scheduler.
Tests execute the shipped JavaScript against success, missing/expired artifacts,
retry attempts, source changes, UTC midnight, DST, and API failure. Workflow and
publisher tests cover no-op wiring and failed-run visibility.

A fresh Evo release was explicitly dispatched from eb87cad (includes #189 and
#192) as run 34363860315 while this fix was implemented. Final release evidence
will be verified before reporting completion.
