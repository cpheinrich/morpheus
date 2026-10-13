# Single-check native change bypass

Task: MO-26-09-26-23.15.20. Fixes #292.

Added an opt-in Git pathspec comparison inside the existing native job, before setup/build/test/evidence. Exact PR merge parents are required; empty configuration and non-PR events retain full execution. This saves native work, not runner allocation/queue time. Callers choose their relevant paths and required check name.

Verification: 153 focused Vitest tests passed (workflow contract, evidence, real Git fixtures); TypeScript typecheck passed. Fixtures cover unrelated/native paths, exclusions, spaces and shell text, renames/deletes, multiple commits, defaults/non-PR events, wrong/missing merge parents and invalid/empty pathspecs. No native app behavior changed. Git matching was preferred to adding picomatch (4.0.7, no runtime dependencies) because Git already owns the required semantics.

Graph tooling was unavailable in this session; workflow/config discovery and verification used exact source and tests. No graph freshness or coverage claim is made.

Independent review by /root/ios_bypass_review cleared the shared-control change with no findings. The reviewer ran all 153 focused tests and additional shallow-checkout probes, including an advanced base. Review took 1.2 minutes at high risk; native application execution is left to the adopting Evo PR.

Independent review cleared the shared-control change with no findings; 153 focused tests and shallow-checkout probes passed. No live native application run was performed in this upstream repository.

```morpheus-review
{
  "version": 1,
  "base": "ac5256083da45da10b4f3014445fcc02c11c63b9",
  "reviewed": "a7c2a4bd912500f8f0e3d2893e0a421e48398c6b",
  "covered": "a7c2a4bd912500f8f0e3d2893e0a421e48398c6b",
  "authorSession": "01a0ded2-7ceb-7743-9092-7056a08f0eab",
  "reviewerSession": "/root/ios_bypass_review",
  "risk": "high",
  "elapsedMinutes": 1.2,
  "outcome": "complete",
  "summary": "Independent review cleared the shared-control change with no findings; 153 focused tests and shallow-checkout probes passed. No live native application run was performed in this upstream repository.",
  "findings": []
}
```
