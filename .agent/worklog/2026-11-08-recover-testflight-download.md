---
date: 2026-11-08
agent: codex
roadmap: MO-26-11-08-02.05.01
tags: [devops, engineering]
outcome: complete
summary: Recover the pinned ASC CLI binary when the normal GitHub release download fails.
---

The browser download repeatedly returned HTTP 504 from two Macs. The public GitHub asset API returned the existing pinned bytes for ARM and Intel, with the existing digests. The ARM installation step succeeded with a simulated primary failure, the real fallback bytes, the real checksum gate, and version 0.18.2 execution. The 23 focused workflow tests, typecheck and compile passed.

## Independent review

Independent Factory review cleared both installers and confirmed the architecture-specific asset IDs and unchanged checksum gate. Two non-blocking notes were recorded.

The fresh Factory follow-up cleared the same implementation, verified both successful download paths, and observed the real primary 504 recover through the checksum-verified fallback. The initial turn was under the required duration and is preserved as incomplete.

Independent review cleared the actionlint fallback after exercising checksum success and rejection and verifying the local workflow caller.

Independent review cleared the focused test update. Its seven workflow tests passed.

```morpheus-review
{
  "version": 2,
  "base": "4629f043d307acdaa261d50f21ecfee97c895405",
  "reviewed": "33024208a177b421d838eeb2e85f3e6f2eb476e6",
  "covered": "0948b6f213b1b45fe3058da593b076c125299253",
  "authorSession": "01a1b9cf-139d-7473-9981-8e7162e9867a",
  "reviewerSession": "f083130b-140b-46ce-a4c3-5b33a4f1d0f7",
  "risk": "normal",
  "elapsedMinutes": 0.49351666666666666,
  "timing": {
    "source": "clock",
    "durationMs": 29611,
    "evidence": "Factory run cd885f74-2a6b-4f87-bdd5-72c80a0726a5 creation 1794132436675 and terminal record mtime 1794132466286, epoch milliseconds."
  },
  "outcome": "complete",
  "summary": "Independent Factory review cleared both installers and confirmed the architecture-specific asset IDs and unchanged checksum gate. Two non-blocking notes were recorded.",
  "findings": [
    {
      "id": "N01",
      "severity": "minor",
      "description": "The automated regression covers fallback and checksum rejection, but not successful binary execution or the original download succeeding.",
      "paths": [
        "tests/ios-release-tooling.test.ts"
      ],
      "disposition": "disputed",
      "response": "The exact installer passed with a real verified ARM asset after a controlled primary failure. The primary-success commands are unchanged and the fallback is only entered on failure."
    },
    {
      "id": "N02",
      "severity": "minor",
      "description": "The unauthenticated GitHub API fallback shares its public per-IP quota.",
      "paths": [
        ".github/actions/ios-testflight-upload/action.yml",
        ".github/workflows/ios-nightly-build.yml"
      ],
      "disposition": "disputed",
      "response": "The API is an occasional fallback, and public access avoids sending a workflow credential to an asset-download endpoint."
    },
    {
      "id": "N03",
      "turn": 4,
      "severity": "minor",
      "description": "The workflow test asserts both routes and bounds without asserting that the fallback only runs after primary failure.",
      "paths": [
        "tests/workflow-expressions.test.ts"
      ],
      "disposition": "disputed",
      "response": "Independent review exercised the fallback ordering using the actual shell. The workflow contract test stays focused on the pins and time budgets."
    }
  ],
  "initialOutcome": "incomplete",
  "followUps": [
    {
      "reviewerSession": "5a7808d9-fc72-4029-b1f7-220773b86b86",
      "commit": "33024208a177b421d838eeb2e85f3e6f2eb476e6",
      "handoff": {
        "reason": "The initial turn measured under the minimum. A fresh reviewer received all findings and ran additional independent checks.",
        "findings": [
          "N01",
          "N02"
        ]
      },
      "outcome": "cleared",
      "elapsedMinutes": 1.7848833333333334,
      "summary": "The fresh Factory follow-up cleared the same implementation, verified both successful download paths, and observed the real primary 504 recover through the checksum-verified fallback. The initial turn was under the required duration and is preserved as incomplete.",
      "timing": {
        "source": "clock",
        "durationMs": 107093,
        "evidence": "Factory run d3bf2e8f-83eb-49d6-b492-4104e3f6a364 creation 1794132537691 and terminal record mtime 1794132644784, epoch milliseconds."
      }
    },
    {
      "reviewerSession": "3853ebd7-0606-4ee9-8ec3-d9b6b85e1bb6",
      "commit": "bdadc4811c16bcb6605cdc9f26e69c4c1c335439",
      "scopeReason": "Required Node CI failed with HTTP 504 before lint when downloading pinned actionlint. The repair retains the checksum, platform and timeout constraints.",
      "handoff": {
        "reason": "Fresh reviewer received the earlier findings and exact late-correction range.",
        "findings": [
          "N01",
          "N02"
        ]
      },
      "outcome": "cleared",
      "elapsedMinutes": 0.8165833333333333,
      "summary": "Independent review cleared the actionlint fallback after exercising checksum success and rejection and verifying the local workflow caller.",
      "timing": {
        "source": "clock",
        "durationMs": 48995,
        "evidence": "Factory run cf1afd4d-91d9-460d-9c2d-0641336c9eea creation 1794132705250 and terminal record mtime 1794132754245, epoch milliseconds."
      }
    },
    {
      "reviewerSession": "f8068181-f514-49e0-a5fd-1725e3fc0d27",
      "commit": "0948b6f213b1b45fe3058da593b076c125299253",
      "scopeReason": "The existing workflow test hard-coded the old single 90-second download. The test-only update checks both bounded routes and the pinned API asset.",
      "handoff": {
        "reason": "Fresh reviewer received the earlier findings and exact late-correction range.",
        "findings": [
          "N01",
          "N02"
        ]
      },
      "outcome": "cleared",
      "elapsedMinutes": 0.4265833333333333,
      "summary": "Independent review cleared the focused test update. Its seven workflow tests passed.",
      "timing": {
        "source": "clock",
        "durationMs": 25595,
        "evidence": "Factory run e1f0dcef-0724-4b15-bc9f-ef9094f6a7ae creation 1794132762945 and terminal record mtime 1794132788540, epoch milliseconds."
      }
    }
  ]
}
```
