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

## Independent review

One fresh independent normal-risk review covered this bounded task across two repositories: the host source change in cpheinrich/agent-host-setup#23 (bc3f8d5..6498991) and these tracking records in cpheinrich/morpheus#608 (deb0555b..1a5ab471). It cleared both with no substantive findings. The roadmap item (status review, prs [608], acceptance path), the acceptance criteria and this worklog match the source change and its documented limit: an omitted run older than the 30 most recent is still missed. The one minor note, R1-1, concerned only the source repository's ci-vm/README.md cost sentence. It was fixed there in README wording at 144351d and recorded in that repository's worklog; no tracking file changed. No Morpheus source changed, so the code-test waiver stands; typecheck and compile passed with no file changes.

```morpheus-review
{
  "version": 2,
  "base": "deb0555b204dffc704482ca998ac083f68e9f320",
  "reviewed": "1a5ab471395b91f0dbc17256b127a08f6eb41902",
  "covered": "1a5ab471395b91f0dbc17256b127a08f6eb41902",
  "authorSession": "05338753-b01b-46ea-b909-bae2289c946c",
  "reviewerSession": "fa45694c-e99a-4c29-bea8-679e0f12f739",
  "risk": "normal",
  "elapsedMinutes": 1.4732666666666667,
  "timing": {
    "source": "runner",
    "durationMs": 88396,
    "evidence": "Factory run f44eb98a-f668-4496-a8bd-50a2a81528eb runner result for session fa45694c-e99a-4c29-bea8-679e0f12f739: subtype success, duration_ms 88396. One review turn covered both repositories' ranges for this task; normal-risk ceiling 15 minutes."
  },
  "outcome": "complete",
  "summary": "One fresh independent normal-risk review covered this bounded task across two repositories: the host source change in cpheinrich/agent-host-setup#23 (bc3f8d5..6498991) and these tracking records in cpheinrich/morpheus#608 (deb0555b..1a5ab471). It cleared both with no substantive findings. The roadmap item (status review, prs [608], acceptance path), the acceptance criteria and this worklog match the source change and its documented limit: an omitted run older than the 30 most recent is still missed. The one minor note, R1-1, concerned only the source repository's ci-vm/README.md cost sentence. It was fixed there in README wording at 144351d and recorded in that repository's worklog; no tracking file changed. No Morpheus source changed, so the code-test waiver stands; typecheck and compile passed with no file changes.",
  "findings": [
    {
      "id": "R1-1",
      "severity": "minor",
      "description": "Source repository cpheinrich/agent-host-setup ci-vm/README.md:127: the claim that a steady state costs one extra list call per repository leaves out recent runs that are not completed and that no filter returns (for example waiting or action_required); each gets a jobs lookup on every poll, up to 30. Bounded; correctness unaffected.",
      "paths": [
        "ci-vm/README.md"
      ],
      "disposition": "fixed",
      "response": "Resolved in the source repository only: cpheinrich/agent-host-setup#23 commit 144351d rewrites that README sentence, and its worklog records the finding. The path is in that repository; no file in this repository changed for it."
    }
  ]
}
```
