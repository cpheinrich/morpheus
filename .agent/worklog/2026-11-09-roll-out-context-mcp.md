---
roadmap: MO-26-11-09-13.57.39
tags: [engineering, devops]
---

# Roll out Context MCP with Morpheus auto-update

Use the device's existing opt-in and local client settings for all checkout roots.
The existing explicit project setup continues to own portable checked-in settings.
Reuse the installer and TOML/JSON parsing. No package lifecycle script or new
dependency is needed. User settings are replaced atomically after a fresh read;
existing server entries and unsupported file shapes are preserved.

A first pull using a legacy hook runs the old process through the whole update.
The reviewed compile step is the only new code it runs before npm installation.
It can register the stable executable when the existing live lock, private
staging directory and exact canonical checkout verify an automatic update.
Startup also retries local configuration. A client that already snapshotted its
configuration needs a reload. No npm package lifecycle script is added.

## Verification

- Focused self-update, context setup and MCP tests cover opted-in device settings,
  disabled opt-out, a disabled entry, idempotence, and unmodified project files.
- Type checking, compile, PM index and complexity checks run on the candidate.
- A physical Studio fast-forward through its opted-in Git hook advanced the
  existing CLI from the prior build to the then-current reviewed main. This is
  baseline evidence. Existing Codex entries on both qualification machines served
  cited searches. These preexisting entries cannot prove candidate setup.

## Device acceptance before merge

Both Macs ran an actual fast-forward, managed post-merge hook, CLI compile, and
standalone npm install from the previous released CLI. The local Git mirror served
the candidate as main. An isolated npm prefix and user profile kept the real CLI
and existing settings separate. Both blank profiles obtained Codex, Claude Code
and Cursor registrations during the pull. The generated Codex entries returned
five tools and cited results from Morpheus and Evo. The Studio fixture initially
lacked pnpm on PATH. Restoring the directory its real Morpheus launcher supplies
reproduced the normal hook environment, and the rerun succeeded.

## Independent review

The independent review blocked on the first legacy pull, executable selection and symlinked settings. A locked compile bridge closed the first-pull gap and clean-profile pulls on the Pro and Studio both installed the candidate and served cited searches. The follow-up conditionally cleared two literal path fixes. Regression tests now execute a launcher with a dollar-ampersand prefix and confirm that a POSIX backslash stays in the profile name. The final review cleared a test-only CI correction for the startup dispatcher.

```morpheus-review
{
  "version": 2,
  "base": "1cabdf008d46d909a4edb6cd187aa365d50b4fcd",
  "reviewed": "4379414583b68b5bb13902661557708f3fb51855",
  "covered": "aa409189001f1d036c0006e33ea731e21d9902d3",
  "authorSession": "01a1c1df-749d-79f2-b01e-6d55d4791967",
  "reviewerSession": "/root/context_rollout_reviewer",
  "risk": "normal",
  "elapsedMinutes": 1.4368833333333333,
  "timing": {
    "source": "clock",
    "durationMs": 86213,
    "evidence": "Codex transcript tool dispatch and verdict timestamps: 2026-11-09T22:02:18.246Z through 2026-11-09T22:03:44.459Z."
  },
  "outcome": "complete",
  "summary": "The independent review blocked on the first legacy pull, executable selection and symlinked settings. A locked compile bridge closed the first-pull gap and clean-profile pulls on the Pro and Studio both installed the candidate and served cited searches. The follow-up conditionally cleared two literal path fixes. Regression tests now execute a launcher with a dollar-ampersand prefix and confirm that a POSIX backslash stays in the profile name. The final review cleared a test-only CI correction for the startup dispatcher.",
  "findings": [
    {
      "id": "CTX-1",
      "severity": "substantive",
      "description": "The first automatic upgrade left MCP unregistered when the old hook finished in the prior CLI.",
      "paths": [
        "src/self-auto-update.ts",
        "src/cli/dispatch.ts"
      ],
      "disposition": "fixed",
      "response": "A live-lock and exact-main guarded compile bridge registers the stable global executable during the first legacy pull. The real hook and CLI installer were exercised on two physical devices against a fixture main ref."
    },
    {
      "id": "CTX-2",
      "severity": "substantive",
      "description": "The user-level launcher could resolve a different CLI under a restricted PATH.",
      "paths": [
        "src/context-search/install.ts"
      ],
      "disposition": "fixed",
      "response": "Bind the launcher to the stable absolute executable. The restricted PATH test executes a custom-prefix wrapper."
    },
    {
      "id": "CTX-3",
      "severity": "substantive",
      "description": "A custom profile could be written through a symlinked ancestor.",
      "paths": [
        "src/context-search/install.ts"
      ],
      "disposition": "fixed",
      "response": "Check every ancestor from the user home or filesystem root. The external-profile symlink regression confirms preservation."
    },
    {
      "id": "CTX-2-LITERAL",
      "severity": "substantive",
      "description": "A literal dollar-ampersand in a custom prefix was expanded by String.replace.",
      "paths": [
        "src/context-search/install.ts"
      ],
      "disposition": "fixed",
      "response": "Use function replacers and execute the launcher with a literal dollar-ampersand path.",
      "turn": 2,
      "condition": {
        "paths": [
          "src/context-search/install.ts",
          "tests/self-auto-update.test.ts",
          "dist/context-search/install.js",
          "dist/context-search/install.js.map",
          "dist/context-search/install.d.ts"
        ],
        "evidence": "Execute generated launcher in a literal dollar-ampersand prefix. Run focused tests, typecheck, compile and diff check."
      },
      "conditionMet": "57 focused tests passed, including the literal executable and profile paths. Typecheck, compile and diff check passed."
    },
    {
      "id": "CTX-3-LITERAL",
      "severity": "substantive",
      "description": "A literal POSIX backslash was treated as a path separator.",
      "paths": [
        "src/context-search/install.ts"
      ],
      "disposition": "fixed",
      "response": "Use the operating-system path separator and check both the literal target and the absent alternate.",
      "turn": 2,
      "condition": {
        "paths": [
          "src/context-search/install.ts",
          "tests/self-auto-update.test.ts",
          "dist/context-search/install.js",
          "dist/context-search/install.js.map",
          "dist/context-search/install.d.ts"
        ],
        "evidence": "Verify a POSIX backslash profile receives the config and the alternate remains absent. Run focused tests, typecheck, compile and diff check."
      },
      "conditionMet": "57 focused tests passed, including the literal executable and profile paths. Typecheck, compile and diff check passed."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "/root/context_rollout_reviewer",
      "commit": "0c0c641b99c8ac81dff2b597b36f9bd7036948a6",
      "outcome": "cleared",
      "elapsedMinutes": 0.6574833333333333,
      "timing": {
        "source": "clock",
        "durationMs": 39449,
        "evidence": "Codex transcript tool dispatch and verdict timestamps: 2026-11-09T22:06:55.039Z through 2026-11-09T22:07:34.488Z."
      },
      "summary": "Confirmed the first-pull bridge and conditionally cleared exact fixes for JavaScript replacement expansion and POSIX literal path handling."
    },
    {
      "reviewerSession": "/root/context_rollout_reviewer",
      "commit": "aa409189001f1d036c0006e33ea731e21d9902d3",
      "outcome": "cleared",
      "elapsedMinutes": 0.2505833333333333,
      "timing": {
        "source": "clock",
        "durationMs": 15035,
        "evidence": "Codex transcript follow-up dispatch and verdict: 2026-11-09T22:13:16.709Z through 2026-11-09T22:13:31.744Z."
      },
      "scopeReason": "Late CI correction: the existing dispatcher mock lacked reportContextMcpSetup; no production code changed.",
      "summary": "Cleared the test-only mock correction and ordering assertions. Both targeted cases passed in review."
    }
  ]
}
```
