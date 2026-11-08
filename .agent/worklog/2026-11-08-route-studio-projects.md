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
