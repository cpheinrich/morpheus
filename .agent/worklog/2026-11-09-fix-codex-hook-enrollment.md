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

Independent review cleared the change with no findings. The reviewer checked both callers, the project identity rules against actual manifests, the committed source and hash guard, and the regression tests. The reviewer relied on the author’s test execution and real Codex backend probe.

```morpheus-review
{
  "version": 2,
  "base": "9b43d1ee4ed779b28df013c4f7f20f27cca531f8",
  "reviewed": "80b1f0b76ab8027e7e82413b72050e9c41d77c1e",
  "covered": "80b1f0b76ab8027e7e82413b72050e9c41d77c1e",
  "authorSession": "01a1c290-b129-7180-934a-8b4f74c535fe",
  "reviewerSession": "/root/review_hook_676",
  "risk": "high",
  "elapsedMinutes": 0.75,
  "timing": {
    "source": "clock",
    "durationMs": 45000,
    "evidence": "Root clock readings surrounding the review: 2026-11-09T23:12:16Z before dispatch and 2026-11-09T23:13:01Z after receipt of the verdict."
  },
  "outcome": "complete",
  "summary": "Independent review cleared the change with no findings. The reviewer checked both callers, the project identity rules against actual manifests, the committed source and hash guard, and the regression tests. The reviewer relied on the author’s test execution and real Codex backend probe.",
  "findings": []
}
```
