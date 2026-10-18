# Bind iOS execution to durable CD intents

Roadmap: MO-26-10-18-07.11.41.

Merged approved main/design 2ac0173 into the already claimed isolated adapter branch
before implementation. Graph tools were unavailable (parent's CLI project lookup blocked
on an active pre-coordination generation); coverage is unknown. Used targeted reads of
known workflow/action/tests and the approved design, with no completeness claim.

The reusable workflow accepts and validates an exact source SHA and durable execution id,
checks out/asserts actual source, disables cancellation for CD, and writes execution.json
from actual checkout/run metadata beside actual xcresult exports. The fixed CD artifact
contract was coordinated with the Evo exporter; ordinary caller naming remains unchanged.

The action exposes reserved build number, trusted before/resource/after hooks, receipt
path/version/build outputs and optional distribution. Existing signing, unsigned archive,
profile, entitlement and signature checks remain; exported IPA identity is now checked
against the receipt's exact app/version/build too. Reserved numbers use the existing exact
explicit-number allocator and raise its legacy floor without being bumped.

Extracted upload-effects.sh so behavioral tests execute the same boundary used after IPA
verification. Hash and validate identity before the atomic claim; exit 3 never uploads or
fabricates acceptance. Publish the upload resource immediately, retain terminal diagnostic
codes, and publish accepted.json/outputs before the after hook. The always() artifact step
survives an after-hook failure. Raw responses/secrets never enter receipts. The protected
caller job and main workflow-ref guard remain the credential boundary.

Considered borrowing generic orchestration helpers: this is a small domain-specific shell
boundary using the existing asccli/Python receipt tools and the controller's ledger bridge;
no new generic library or dependency was needed. Coordinated identity/receipt contracts
with the core controller and thin Evo consumer owners. No live Apple upload, distribution,
service configuration mutation, or operational acceptance was attempted.

## Validation

- pnpm typecheck passed; pnpm compile passed.
- pnpm exec vitest run tests/upload-receipt.test.ts tests/workflows.test.ts
  tests/ios-evidence-workflow.test.ts tests/ios-change-scope.test.ts
  tests/ios-build-cache.test.ts tests/upload-configuration.test.ts: 202 tests passed.
- Python behavioral harness: 14 tests passed, included in the Vitest receipt test.
- A first focused run caught one old test assuming checkout was step 0; updated its exact
  expected identity/checkout/assertion/scope ordering, then the complete focused scope passed.
- Final same-scope run after guard/IPA identity additions: 204 tests passed in six files.
- pnpm morpheus pm index passed, indexes unchanged; bash -n and git diff --check passed.
- The sandbox denied tsx's local IPC socket for context/index commands. Used the compiled
  CLI for context refresh and an elevated pnpm index invocation; verified remote main
  2ac0173. No user prompt or secret access was needed.

Full suite is left to CI per repository policy (this PR changes no shared TypeScript core).
No Xcode archive was run: existing archive guards are retained, and fake asccli/hooks cover
the real upload boundary without consuming the campaign's native runner or uploading.

## Independent review and CD-ADAPTER-001 response

The fresh high-risk reviewer `/root/cd_adapters_review` reviewed 2dc7659 and independently
passed the 204 focused tests. Its only finding was substantive: a synchronous resource-hook
failure after Apple returned PROCESSING/COMPLETE exited before accepted.json and its output
were written, hiding known acceptance from artifact persistence. The initial verdict is
blocked. The same reviewer subsequently cleared e203b54 with no remaining or new findings,
independently passing 177 tests across three focused files, including all 17 Python cases,
plus shell syntax and diff checks. No live Apple or Xcode execution was performed.

The adapter now atomically publishes known acceptance and outputs before invoking the
resource hook, on both the initial response and the acceptance poll. The original hook
exit status still fails the job. Provisional resource publication also exposes resource-path,
and the always() artifact includes only the two explicit allowlisted receipt paths, so
awaiting/failed/invalid uploads survive a ledger outage without fabricated acceptance.
The exact-resource-id check occurs before replacing a provisional receipt.

Added actual-boundary cases for resource hook exit 11 on initial and polled PROCESSING/COMPLETE
responses, and for resource-only AWAITING_UPLOAD/FAILED/INVALID responses. The hooks themselves
assert acceptance and the output already exist when called with an accepted resource. An
initial fixture used a shell-quoted state pattern incorrectly; corrected it to compare the
parsed JSON state. All 17 Python behavioral tests then passed. Final aggregate and required
checks passed: the same six-file focused command passed 204/204; pnpm typecheck,
pnpm compile, compiled CLI pm index (unchanged indexes), bash -n and git diff --check
passed. No full suite or live upload was run. The actual initial blocked verdict and
96000 ms clock measurement are retained below.

The initial high-risk review blocked on substantive CD-ADAPTER-001: a resource-hook failure could hide known Apple acceptance. The same reviewer cleared correction e203b54 after verifying acceptance and provisional resource evidence survive hook failure while the job retains its failure result. No remaining or new findings.

```morpheus-review
{
  "version": 2,
  "base": "2ac0173ed5b346ca76c8abe977135b6a32b37ffb",
  "reviewed": "2dc7659dd3af42e096289ac0072bc9bbe222cf57",
  "covered": "e203b547d6468edfc5e4f1fe8a9f0a54e31fb79f",
  "authorSession": "01a14e59-b8cf-75f3-98a4-742b7927c7f0",
  "reviewerSession": "/root/cd_adapters_review",
  "risk": "high",
  "elapsedMinutes": 1.6,
  "timing": {
    "source": "clock",
    "durationMs": 96000,
    "evidence": "Parent clock observations around the initial reviewer invocation: 2026-10-18T14:22:14Z to 2026-10-18T14:23:50Z, including tools and waiting for the returned result."
  },
  "outcome": "complete",
  "summary": "The initial high-risk review blocked on substantive CD-ADAPTER-001: a resource-hook failure could hide known Apple acceptance. The same reviewer cleared correction e203b54 after verifying acceptance and provisional resource evidence survive hook failure while the job retains its failure result. No remaining or new findings.",
  "findings": [
    {
      "id": "CD-ADAPTER-001",
      "severity": "substantive",
      "description": "upload-effects.sh resource hook at line 36 ran synchronously before acceptance publication at line 66. After an Apple PROCESSING/COMPLETE response, hook exit 11 under errexit skipped accepted.json and receipt-path, so the always artifact also skipped known acceptance.",
      "paths": [
        ".github/actions/ios-testflight-upload/upload-effects.sh",
        ".github/actions/ios-testflight-upload/action.yml"
      ],
      "disposition": "fixed",
      "response": "Publish accepted.json and step outputs before any resource hook on both initial and polled acceptance; retain hook failure status. Publish resource-path and allowlist both receipt files in the always artifact for provisional/terminal hook outages. Behavioral tests cover initial/polled accepted states and awaiting/failed/invalid resource-only states. The same reviewer verified the correction at e203b54, ran 177 focused tests across three files including all 17 Python cases, and returned cleared with no remaining or new findings."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "/root/cd_adapters_review",
      "commit": "e203b547d6468edfc5e4f1fe8a9f0a54e31fb79f",
      "scopeReason": "Verify the CD-ADAPTER-001 receipt-publication correction and its regression tests against the initially reviewed commit.",
      "humanAuthorization": {
        "approvedBy": "Christopher Heinrich",
        "approvedAt": "2026-10-18T13:50:22.909Z",
        "reason": "Christopher explicitly authorized the CD implementation and repository merges and the review rounds needed for this task, including an exception to the three-round limit. This is the first same-reviewer follow-up and preserves the initial blocked verdict."
      },
      "outcome": "cleared",
      "elapsedMinutes": 0.45,
      "timing": {
        "source": "clock",
        "durationMs": 27000,
        "evidence": "Parent clock observations around the same-reviewer follow-up invocation: 2026-10-18T14:26:51Z to 2026-10-18T14:27:18Z, including tools and waiting for the returned result."
      },
      "summary": "Compared 2dc7659 to e203b54; CD-ADAPTER-001 is resolved. Known acceptance and its outputs are published before resource hooks on initial and polled responses; resource-only evidence remains available after hook failure. Independently passed 177 tests in three focused files, including all 17 Python cases, plus shell syntax and diff checks. No remaining or new findings; no live Apple or Xcode execution."
    }
  ]
}
```
