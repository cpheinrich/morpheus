---
roadmap: MO-26-11-08-00.57.12
tags: [engineering, factory]
---

The Studio still runs one supervisor and admits one task at a time. A project
route reuses the established executor with a distinct execution account, project ID and mirror;
the original route still supports pinned fixtures. Unconfigured routes never
reach the executor. Recovery uses the inspected task to find its project’s result store. No dependency or cloud schema change is needed.

Focused tests cover project selection, rejected routes, shared recovery, exact
Git checkout isolation and interruption. Operator enrollment is separate from
public source and uses one read-only key and mirror for each private repository.

The initial review reproduced cross-project reads and duplicate mirror aliases. The follow-up cleared the isolated accounts and set an exact condition for rejecting filesystem aliases. The author satisfied that condition and all 13 focused tests passed.

```morpheus-review
{
  "version": 2,
  "base": "03c6f7eb5e66bc93f0f7074cc93d51f4e8197000",
  "reviewed": "03f93873d59497cff6d5fecfa2e4feec159be199",
  "covered": "5df50b2eb448e2787ff3cf8cf5e5962f9e5bac0e",
  "authorSession": "01a1b31a-3c67-7941-bc8e-935345b8500b",
  "reviewerSession": "/root/studio_route_review",
  "risk": "high",
  "elapsedMinutes": 2.2031,
  "timing": {
    "source": "clock",
    "durationMs": 132186,
    "evidence": "Controller observed review invocation/result around 2026-11-08T08:59:38.458Z and 2026-11-08T09:01:50.644Z for /root/studio_route_review."
  },
  "outcome": "complete",
  "summary": "The initial review reproduced cross-project reads and duplicate mirror aliases. The follow-up cleared the isolated accounts and set an exact condition for rejecting filesystem aliases. The author satisfied that condition and all 13 focused tests passed.",
  "findings": [
    {
      "id": "STUDIO-01",
      "severity": "substantive",
      "description": "A controller for one project could read another project's source through the shared execution account.",
      "paths": [
        "plugins/factory/src/fleet-execution.mjs"
      ],
      "disposition": "fixed",
      "response": "Use a distinct execution UID, mirror ACL, worker config, home and workspace for each extra project. Recover using the task's exact project. On Studio each account was denied access to the other's repository and workspace."
    },
    {
      "id": "STUDIO-02",
      "severity": "substantive",
      "description": "Two enrolled project IDs could refer to the same physical mirror via a path alias.",
      "paths": [
        "plugins/factory/src/fleet-execution.mjs",
        "plugins/factory/tests/fleet-execution.test.mjs"
      ],
      "disposition": "fixed",
      "response": "Compare canonical filesystem device and inode, and exercise dot, symlink and case aliases.",
      "condition": {
        "paths": [
          "plugins/factory/src/fleet-execution.mjs",
          "plugins/factory/tests/fleet-execution.test.mjs"
        ],
        "evidence": "Compare filesystem device and inode, add a case-alias regression which runs on the Mac and skips only on case-sensitive filesystems, and rerun the execution, runner and source suites and complexity."
      },
      "conditionMet": "The diff from ac989eff to 5df50b2e only touches the two named files. The Mac case alias ran without skip; all 13 focused tests passed. Complexity passed (28 functions; limit 15)."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "/root/studio_route_review",
      "commit": "ac989eff0fa4829fdac30046183b72a7efe4dea4",
      "outcome": "cleared",
      "elapsedMinutes": 0.7506333333333334,
      "timing": {
        "source": "clock",
        "durationMs": 45038,
        "evidence": "Controller observed review invocation/result around 2026-11-08T09:03:07.215Z and 2026-11-08T09:03:52.253Z for /root/studio_route_review."
      },
      "summary": "Independently passed all 12 tests at the reviewed commit. Cleared execution account separation and set a condition on rejecting aliases by filesystem identity after reproducing a case alias. No new findings."
    }
  ]
}
```
