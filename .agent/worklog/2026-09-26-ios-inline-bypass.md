# Single-check native change bypass

Task: MO-26-09-26-23.15.20. Fixes #292.

Added an opt-in Git pathspec comparison inside the existing native job, before setup/build/test/evidence. Exact PR merge parents are required; empty configuration and non-PR events retain full execution. This saves native work, not runner allocation/queue time. Callers choose their relevant paths and required check name.

Verification: 153 focused Vitest tests passed (workflow contract, evidence, real Git fixtures); TypeScript typecheck passed. Fixtures cover unrelated/native paths, exclusions, spaces and shell text, renames/deletes, multiple commits, defaults/non-PR events, wrong/missing merge parents and invalid/empty pathspecs. No native app behavior changed. Git matching was preferred to adding picomatch (4.0.7, no runtime dependencies) because Git already owns the required semantics.

Graph tooling was unavailable in this session; workflow/config discovery and verification used exact source and tests. No graph freshness or coverage claim is made.

Independent review pending.
