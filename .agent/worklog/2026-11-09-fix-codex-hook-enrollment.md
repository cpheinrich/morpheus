---
date: 2026-11-09
agent: codex
roadmap: MO-26-11-09-15.09.49
outcome: review
tags: [engineering]
summary: Accepted existing committed project identities for Codex hook approval without requiring a scaffold version.
---

Both hook commands treated the optional scaffold version as proof of project identity.
Use the same name, kind and prefix rules as the project registry, without consulting
local registry entries. Keep HEAD as the source of the manifest, distinguish missing
and malformed files from invalid identity fields, and keep the hook scope and hash
verification unchanged. No new dependency.

The original implementation failed both the one-shot approval and automatic
enrollment scenarios with the unversioned fixture. After the fix, the focused
hook and trust suites passed all 42 tests. The real desktop backend approved the
reporter's committed hook in an isolated Codex home; repeat approval was a no-op,
and enrollment, scan and disable succeeded. Typecheck, compile, PM indexes and
complexity also passed.
