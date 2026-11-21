---
date: 2026-11-20
agent: codex
roadmap: MO-26-11-20-13.19.42
outcome: review
tags: [engineering, devops]
---

# Check the live App Store version before iOS delivery

The common iOS release gate now compares the pinned Xcode project with Apple’s public storefront before release work. The checker proposes the next patch when the versions match. A guarded write resets the Xcode build settings to zero and callers use their normal protected PR process before restarting delivery.

## Verification

The controller verified the Fleet patch against the published claim and ran 287 focused tests, typecheck, compile, project index, actionlint and the changed-function complexity check. The live listing matched Xcode 1.0. A throwaway project was rewritten to 1.0.1 and build 0, validated with plutil and compared byte for byte with the downstream candidate. The live check accepted the new candidate as ahead. No package was added.

Fleet implementation ran with Codex on the MacBook Pro. The focused tests use simulated lookup failures. The controller separately read the actual public store and validated the real Xcode file.

## Independent review

The exact final candidate cleared independent Fleet review. The opt-in workflow rejects indirect archive identity before release work, with an actual Xcode fixture proving stable generated and explicit plists still archive as 1.0.1. Exact run-attempt checks and the archive identity readback remain enforced.

```morpheus-review
{
  "version": 2,
  "base": "2c5f4147cff2edd468ebdd24c73189af63ecd259",
  "reviewed": "76e983e6d39e85ee18ec3a3c6ac6956dc054f909",
  "covered": "823167ff901b9674cf639cbc23f516cc85fbdf54",
  "authorSession": "01a1fad2-d164-7ad3-b60a-8fcd9dea746c",
  "reviewerSession": "01a1fae6-096b-7870-9c88-a72cd0d7d477",
  "risk": "high",
  "elapsedMinutes": 7.389083333333334,
  "timing": {
    "source": "runner",
    "durationMs": 443345,
    "evidence": "Factory Fleet 472172ba-953d-4531-a007-5a932b8baa05 attempt 513e5b77-f2f5-4754-a953-eb211486fb5b session 01a1fae6-096b-7870-9c88-a72cd0d7d477. Guardian process.json for admission c4f5a1ac-052c-40c6-954f-9f9cb9087664; monotonic duration includes owned cleanup."
  },
  "outcome": "complete",
  "summary": "The exact final candidate cleared independent Fleet review. The opt-in workflow rejects indirect archive identity before release work, with an actual Xcode fixture proving stable generated and explicit plists still archive as 1.0.1. Exact run-attempt checks and the archive identity readback remain enforced.",
  "contextRead": [
    "AGENTS.md",
    "morpheus.json",
    "hq/product/roadmap/MO-26-11-20-13.19.42-reconcile-ios-versions.md",
    "architecture.md",
    ".agent/decisions.md",
    ".agent/learned.md",
    ".agent/worklog/2026-09-01-ios-release-number-ownership.md",
    ".agent/worklog/MO-26-11-04-00.19.43.md",
    "docs/runbooks/test-quality.md",
    "docs/runbooks/independent-review.md",
    "docs/runbooks/context-freshness.md",
    ".agent/worklog/2026-11-20-reconcile-ios-versions.md",
    ".agent/context-core.md"
  ],
  "findings": [
    {
      "id": "IOS-VER-1",
      "severity": "substantive",
      "description": "The project-file plan does not verify the effective marketing version or bundle of the release target.",
      "paths": [
        ".github/actions/ios-app-store-version/version.mjs",
        ".github/workflows/ios-nightly-build.yml",
        "tests/ios-app-store-version.test.ts",
        ".github/actions/ios-testflight-upload/upload-testflight.sh",
        "tests/workflows.test.ts",
        "architecture.md",
        ".github/actions/ios-app-store-version/archive-identity.mjs"
      ],
      "disposition": "fixed",
      "response": "The workflow validates a restricted static identity shape against the exact effective archive before comparing with the storefront. A build-number-dependent plist no longer qualifies."
    },
    {
      "id": "IOS-VER-2",
      "severity": "substantive",
      "description": "The updater matches names anywhere in the plist and rewrites non-build-setting data.",
      "paths": [
        ".github/actions/ios-app-store-version/version.mjs",
        "tests/ios-app-store-version.test.ts"
      ],
      "disposition": "fixed",
      "response": "The updater scopes changes to structured XCBuildConfiguration build settings and preserves unrelated data and comments."
    },
    {
      "id": "IOS-VER-3",
      "severity": "substantive",
      "description": "Opted-in callers can still receive a release-looking build=true and verified SHA after the version gate fails.",
      "paths": [
        ".github/workflows/ios-nightly-build.yml",
        "tests/workflows.test.ts",
        "architecture.md"
      ],
      "disposition": "fixed",
      "response": "The opt-in caller’s build and SHA require exact verified source, matching attempts, accepted store comparison and successful tests."
    },
    {
      "id": "IOS-VER-4",
      "severity": "substantive",
      "description": "Selective retries can reuse a successful store comparison after Apple's live version changes.",
      "paths": [
        ".github/workflows/ios-nightly-build.yml",
        "architecture.md",
        "tests/workflows.test.ts"
      ],
      "disposition": "fixed",
      "response": "Release eligibility and both upload paths require successful storefront verification from the same attempt."
    },
    {
      "id": "IOS-VER-5",
      "turn": 2,
      "severity": "substantive",
      "description": "Retrying the new failed version-check can turn an earlier attempt's source preflight into fresh release eligibility for superseded main.",
      "paths": [
        ".github/workflows/ios-nightly-build.yml",
        ".github/workflows/release-preflight.yml",
        "tests/workflows.test.ts",
        "architecture.md"
      ],
      "disposition": "fixed",
      "response": "The reusable preflight reports a verified current-main attempt before release work can qualify."
    },
    {
      "id": "IOS-VER-6",
      "turn": 3,
      "severity": "substantive",
      "description": "The selected explicit plist can permanently identify a different App Store app than the checked Xcode bundle setting.",
      "paths": [
        ".github/workflows/ios-nightly-build.yml",
        ".github/actions/ios-testflight-upload/upload-testflight.sh",
        "tests/workflows.test.ts",
        "architecture.md",
        ".github/actions/ios-app-store-version/archive-identity.mjs"
      ],
      "disposition": "fixed",
      "response": "The selected plist’s literal or directly expanded bundle ID must match the storefront, free of competing overrides."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "01a1fb03-a7db-74b3-a2d4-8c90c7149a9d",
      "commit": "643b00260f9268450befb67c2906ae05481c490e",
      "base": "886e4acb48b8468035439215f92f65fb083cc885",
      "scopeReason": "This turn independently reviewed the exact corrected candidate after integrating the then-current protected main.",
      "handoff": {
        "reason": "Each fresh Fleet review session is bound to its exact published candidate.",
        "findings": [
          "IOS-VER-1",
          "IOS-VER-2",
          "IOS-VER-3",
          "IOS-VER-4"
        ]
      },
      "outcome": "blocked",
      "blockedOn": [
        "IOS-VER-1",
        "IOS-VER-5"
      ],
      "elapsedMinutes": 7.98655,
      "timing": {
        "source": "runner",
        "durationMs": 479193,
        "evidence": "Factory Fleet c123a83d-fdff-4810-b8ca-bbc278386a59 attempt 2ceb272a-0570-4508-bef2-1cd087caa6eb session 01a1fb03-a7db-74b3-a2d4-8c90c7149a9d. Guardian process.json for admission e565ffe7-9aba-4ed1-9739-e7fd4c3fe007; monotonic duration includes owned cleanup."
      },
      "summary": "Fresh independent follow-up, blocked on IOS-VER-1 and IOS-VER-5. The inherited Release configuration and bundle checks now work, but a real unsigned Xcode archive still carried the public version even when the gate qualified a higher build setting. A selective retry of the new version-check can also release a source SHA whose current-main check came from the old attempt. IOS-VER-2, IOS-VER-3, and the exact stale-version-result scenario in IOS-VER-4 are resolved. No tracked edits, GitHub writes, workflow dispatch, Apple calls, signing, upload, or App Review action. Request runner duration from the unattended result for this reviewer session; test duration is not turn duration."
    },
    {
      "reviewerSession": "01a1fb21-a908-7901-9a4d-e4e3ed644184",
      "commit": "d50a2fb400de48c9663c5e8142b936648ac4dc8a",
      "handoff": {
        "reason": "Each fresh Fleet review session is bound to its exact published candidate.",
        "findings": [
          "IOS-VER-1",
          "IOS-VER-2",
          "IOS-VER-3",
          "IOS-VER-4",
          "IOS-VER-5"
        ]
      },
      "outcome": "blocked",
      "blockedOn": [
        "IOS-VER-1",
        "IOS-VER-6"
      ],
      "elapsedMinutes": 5.4521,
      "timing": {
        "source": "runner",
        "durationMs": 327126,
        "evidence": "Factory Fleet ab6983c8-498c-48ad-ad35-52a151d66434 attempt 05145e00-22c4-4534-804a-647a4ac18bb2 session 01a1fb21-a908-7901-9a4d-e4e3ed644184. Guardian process.json for admission 60528413-0a50-4325-80bf-dd8c9fbaba23; monotonic duration includes owned cleanup."
      },
      "summary": "The retained-preflight retry (IOS-VER-5) is resolved, and the original literal 1.0 regression now fails closed. IOS-VER-1 remains open on an ordinary archive build-number override changing the resolved checked-in plist; IOS-VER-6 is a new substantive bundle-identity mismatch. Keep IOS-VER-1 in the existing record with its original severity; this is follow-up evidence, not a second finding under the same ID. No evidence reopens previously cleared IOS-VER-2, IOS-VER-3, or IOS-VER-4. A small flow diagram could help distinguish the pre-test metadata query from the archive-time overrides, but it is advisory and not a gate. No UI evidence was applicable. No tracked edits, commits, pushes, GitHub posts, workflow dispatch, Apple requests or writes, signing, or upload. The read-only gh pr view could not authenticate, so I reviewed the supplied PR body. MCP search reported Tantivy unavailable and local morpheus context search reported Tantivy build failed; direct MCP cited reads worked, and governing policy came from git show at the trusted base. Use the unattended runner's duration metadata for this turn, not test time."
    },
    {
      "reviewerSession": "01a1fb49-eda3-77a2-b2e1-0a736cc29f9b",
      "commit": "f7067bb98422d2d5580e09334ba95c80d9cb043e",
      "base": "0e764d9c326ca50c05c24f566cd9dd17c0054920",
      "scopeReason": "This turn independently reviewed the exact corrected candidate after integrating the then-current protected main.",
      "handoff": {
        "reason": "Each fresh Fleet review session is bound to its exact published candidate.",
        "findings": [
          "IOS-VER-1",
          "IOS-VER-2",
          "IOS-VER-3",
          "IOS-VER-4",
          "IOS-VER-5",
          "IOS-VER-6"
        ]
      },
      "outcome": "blocked",
      "blockedOn": [
        "IOS-VER-1"
      ],
      "elapsedMinutes": 12.742433333333333,
      "timing": {
        "source": "runner",
        "durationMs": 764546,
        "evidence": "Factory Fleet 2684e97e-1c97-4ae4-9740-eef14501a2f4 attempt f18dd2a6-c2fc-4273-bb76-7ab49ff4830b session 01a1fb49-eda3-77a2-b2e1-0a736cc29f9b. Guardian process.json for admission 0a70acd0-9509-4a01-9ec9-986fd9c2141d; monotonic duration includes owned cleanup."
      },
      "summary": "Fourth independent review complete and blocked only on IOS-VER-1. The exact previous build 12/13 repro now refuses, but the same flaw survives when 12 and the synthetic probe 13 share a default plist and allocated build 14 selects another. The exact gate admitted 1.0.1; the real unsigned build 14 archive carried 1.0. IOS-VER-6 is resolved; IOS-VER-2 through IOS-VER-5 remain resolved. No tracked files changed. No GitHub writes, workflow dispatch, signing, upload, or App Store Connect requests or mutations."
    },
    {
      "reviewerSession": "01a1fc5a-fa0a-7630-98f9-57872f71e427",
      "commit": "823167ff901b9674cf639cbc23f516cc85fbdf54",
      "base": "e34f8d6c9bbb7ab40d0c6152a97476cceac49ec5",
      "scopeReason": "This turn independently reviewed the exact corrected candidate after integrating the then-current protected main.",
      "handoff": {
        "reason": "Each fresh Fleet review session is bound to its exact published candidate.",
        "findings": [
          "IOS-VER-1",
          "IOS-VER-2",
          "IOS-VER-3",
          "IOS-VER-4",
          "IOS-VER-5",
          "IOS-VER-6"
        ]
      },
      "outcome": "cleared",
      "elapsedMinutes": 5.2167,
      "timing": {
        "source": "runner",
        "durationMs": 313002,
        "evidence": "Factory Fleet 85142ecf-cdf8-48f4-ac3c-09089883a622 attempt fa3ec756-7309-4f2c-8458-bfc906eeea31 session 01a1fc5a-fa0a-7630-98f9-57872f71e427. Guardian process.json for admission 28bf2572-8a0c-47a5-a2d6-9825ffa520b9; monotonic duration includes owned cleanup."
      },
      "summary": "Fifth independent review of Morpheus #749. All six prior substantive findings are resolved; no new findings. The exact candidate metadata step rejected the real prior indirect xcconfig fixture with no version output. The previous step still admitted it, although the unsigned build-14 archive carried 1.0. Stable generated and explicit plist fixtures qualified and archived 1.0.1 under the same allocated build number. No tracked edits, GitHub writes, CI dispatch, signing, uploads, or Apple requests or writes. The separate Evo rollout and required CI are not part of this clearance."
    }
  ]
}
```
