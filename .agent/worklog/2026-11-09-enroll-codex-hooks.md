---
date: 2026-11-09
agent: codex
roadmap: MO-26-11-09-13.00.22
outcome: review
tags: [engineering]
summary: Added explicit per-project enrollment that approves future eligible Codex hook changes on macOS.
---

# Automatically approve committed hooks in enrolled projects

The requester clarified that approval should continue after the initial invocation. The
existing `approve` command remains one-shot. `enable` records the current Morpheus
checkout in the private Codex home and loads one login job for that home. The job checks
the enrolled checkouts once a minute and applies the same Git-source and hook-hash checks
as `approve`. A different checkout at the same path cannot inherit enrollment.
`disable` stops future approvals for the project and unloads the job when the last
project is removed. Codex keeps previously saved approval hashes.

A local timer handles committed changes regardless of how a project got to the new
checkout state. It also works when no Codex chat is open. The public repo does not
contain the enrolled projects or write a project-level opt-in file. Considered the
maintained `plist` package (two runtime dependencies). Used the macOS `plutil` already
available wherever the login job runs, so there is no new package dependency.

## Verification

- `pnpm typecheck`, `pnpm compile`, `pnpm morpheus pm index`, and
  `morpheus complexity check` passed (CCN limit 15).
- `pnpm exec vitest run tests/codex-hooks.test.ts tests/doctor-codex-trust.test.ts`
  passed (40 tests). Coverage includes a new committed hook after enrollment, unchanged
  plugin approval state, disable, checkout replacement, and job startup failure. It also
  exercises revoking a missing checkout and releasing the native lock after abrupt exit.
- Ran the compiled CLI with the real macOS login job, two isolated Morpheus checkouts,
  and a temporary Codex home. The first project approved its initial hook on enable.
  After a new commit, the actual minute timer approved the new hook without another
  command, and the other checkout had no approvals. Disabling unloaded the job,
  preserved both saved approvals, and prevented approval of the next commit.

Independent review found that a stopped scanner could strand the directory lock and a missing checkout could not be revoked. The follow-up confirmed the native lock and path-based revocation, and cleared on condition that revocation prefer the saved literal path over a symlink. The corrected implementation preserves the other enrollment and its running job. The author satisfied the condition with the two-project regression, all 40 focused tests, typecheck, compilation, and a clean diff.

```morpheus-review
{
  "version": 2,
  "base": "4da6594a0d98708eef6c95785d9c08c7628ec850",
  "reviewed": "4f5850a50c298164853915f51ff6eecfb77188ff",
  "covered": "6c19a42e135841219e16cb4d66648b81036bbbbe",
  "authorSession": "01a1c1f7-edcd-7ac3-9ab0-99d0f256650b",
  "reviewerSession": "/root/codex_enrollment_review",
  "risk": "high",
  "elapsedMinutes": 1.2333333333333334,
  "timing": {
    "source": "clock",
    "durationMs": 74000,
    "evidence": "Root clock readings for /root/codex_enrollment_review initial turn: 2026-11-09T21:05:28Z before dispatch and 2026-11-09T21:06:42Z after verdict."
  },
  "outcome": "complete",
  "summary": "Independent review found that a stopped scanner could strand the directory lock and a missing checkout could not be revoked. The follow-up confirmed the native lock and path-based revocation, and cleared on condition that revocation prefer the saved literal path over a symlink. The corrected implementation preserves the other enrollment and its running job. The author satisfied the condition with the two-project regression, all 40 focused tests, typecheck, compilation, and a clean diff.",
  "findings": [
    {
      "id": "EN-R1",
      "severity": "substantive",
      "paths": [
        "src/cli/codex-hooks.ts",
        "src/cli/codex-hooks-auto.ts"
      ],
      "description": "Logout or a terminated macOS scan could strand the approval directory lock and block future approvals and revocation.",
      "disposition": "fixed",
      "response": "Use the macOS lockf descriptor mode so the kernel releases the lock on process exit. The regression proved contention while alive and successful retry after killing the holder."
    },
    {
      "id": "EN-R2",
      "severity": "substantive",
      "paths": [
        "src/cli/codex-hooks-auto.ts"
      ],
      "description": "Revocation required resolving a live Git checkout, so moved or deleted checkouts could not be removed.",
      "disposition": "fixed",
      "response": "Allow disable with the path shown by status. A test moves the checkout, revokes its enrollment, and confirms restoring it does not restart approval."
    },
    {
      "id": "EN-R3",
      "turn": 2,
      "severity": "substantive",
      "paths": [
        "src/cli/codex-hooks-auto.ts"
      ],
      "description": "Revoking a saved path now symlinked to a different enrolled project removed both enrollments.",
      "disposition": "fixed",
      "response": "Match the saved literal path first, resolving a symlink only as a fallback.",
      "condition": {
        "paths": [
          "src/cli/codex-hooks-auto.ts",
          "tests/codex-hooks.test.ts",
          "dist/cli/codex-hooks-auto.js",
          "dist/cli/codex-hooks-auto.js.map"
        ],
        "evidence": "Add a two-project regression showing that revoking A when its saved path links to B removes A, preserves B, and keeps the job loaded. Run the focused suite, pnpm typecheck, pnpm compile, and git diff --check."
      },
      "conditionMet": "The two-project regression confirmed only B remains and no unload is requested. The focused suite passed all 40 tests; pnpm typecheck, pnpm compile, and git diff --check passed."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "/root/codex_enrollment_review",
      "commit": "e0dca87a8b7b7e695343f34f908a3fa937eaafd0",
      "outcome": "cleared",
      "elapsedMinutes": 0.65,
      "timing": {
        "source": "clock",
        "durationMs": 39000,
        "evidence": "Root clock readings for /root/codex_enrollment_review follow-up: 2026-11-09T21:08:40Z before dispatch and 2026-11-09T21:09:19Z after verdict."
      },
      "summary": "R1 is resolved and missing-checkout revocation works. All 39 focused tests passed. Cleared on condition that a saved literal path take precedence over its symlink target, with a two-project regression."
    }
  ]
}
```
