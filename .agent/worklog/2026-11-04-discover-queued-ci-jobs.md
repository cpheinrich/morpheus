---
id: MO-26-11-04-07.16.25
title: "Discover queued CI jobs missing from filtered lists"
date: 2026-11-04
tags: [engineering, devops]
---

# 2026-11-04 — discover queued CI jobs missing from filtered lists (MO-26-11-04-07.16.25)

Tracking record for a host-only change; Morpheus source is unchanged. The implementation, tests,
worklog and independent review live in cpheinrich/agent-host-setup#23
(`ci-vm/dispatcher.mjs` `queuedJobs`, `ci-vm/dispatcher.test.mjs`, `ci-vm/README.md`,
`.agent/worklog/2026-11-04-discover-queued-ci-jobs.md` there).

The CI VM dispatcher found demand only through status-filtered run lists, which omitted a run
whose exact-label job was queued. It now also reconciles one unfiltered page of the 30 most
recent runs, deduplicated, inspecting only runs not completed; a failure there keeps the filtered
demand. The replay regression failed on the host base and passes after the fix, and four mutants
are killed. Acceptance criteria: `qa/acceptance/MO-26-11-04-07.16.25.md`. Install and the
production observation stay with the root operator after reviewed merge.
