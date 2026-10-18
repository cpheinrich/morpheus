# Accept verified CD control tags for iOS upload

Roadmap: MO-26-10-18-08.08.27.

Created and claimed a new isolated worktree from latest main a14aeff. Read the operating
record delta since the approved design and the current action/dispatcher. Graph tooling is
unavailable (parent's active pre-coordination generation); coverage remains unknown. Used
known-path source reads only, with no exhaustive graph claim. The pm claim command also
reconciled the three now-merged CD design/core/adapter roadmap records to shipped.

The dispatcher deliberately creates and verifies an exact control tag because GitHub rejects
raw SHA workflow-dispatch refs. The action's old main-only shell guard rejected this path.
The minimal correction keeps main legacy behavior and accepts only the exact tag bound to
MORPHEUS_CD_CONTROL_SHA and GITHUB_SHA, a full exact source SHA, complete durable ids, both
trusted hooks, positive reserved build number and disabled action-side distribution. Existing
hook path validation, signing/IPA verification and atomic ledger claim still run afterward.
No arbitrary tag, feature branch, or tag name alone receives release authority.

Tests execute the actual complete upload script with a fixture Xcode project and executable
hooks. Valid main and exact CD-tag environments reach credential-free package resolution,
where fake xcodebuild records its exact first argument and exits 73. Seventeen invalid/missing
ref, SHA, identity and control-input cases exit 1 without reaching that stub. No actual Xcode,
signing or Apple request occurs. No private consumer code or data was sent to another service.
No new library was considered necessary for this narrow existing domain guard.

## Validation

- pnpm exec vitest run tests/upload-configuration.test.ts tests/workflows.test.ts
  tests/upload-receipt.test.ts: 178 tests passed across three files, including 17 Python
  upload-boundary cases and the new full-script guard test.
- pnpm typecheck; pnpm compile; compiled CLI pm index; bash -n; git diff --check.
- Full suite remains CI's responsibility under repository policy; no shared core changed.
- Fresh independent review and merge are owned by the parent campaign. Draft only until clear.

## Independent review

Fresh independent high-risk review cleared the exact control-tag guard correction with no findings. The reviewer verified the dispatcher/tag, signing-lock entrypoint, receipt identity and durable upload claim boundaries, and independently passed all 13 upload-configuration tests, including the real script with seventeen rejected variants, plus shell syntax and diff checks. No Apple request occurred.

```morpheus-review
{
  "version": 2,
  "base": "a14aeffed5a4cfda8ddd9f3d02b066f9602e1a3a",
  "reviewed": "14cb4f65c7e8d83a6402caa9573d38bbdef2c68d",
  "covered": "14cb4f65c7e8d83a6402caa9573d38bbdef2c68d",
  "authorSession": "01a14e59-b8cf-75f3-98a4-742b7927c7f0",
  "reviewerSession": "/root/cd_tag_adapter_review",
  "risk": "high",
  "elapsedMinutes": 0.5333333333333333,
  "timing": {
    "source": "clock",
    "durationMs": 32000,
    "evidence": "Parent clock observations around the fresh reviewer invocation: 2026-10-18T15:10:54Z to 2026-10-18T15:11:26Z, including tools and waiting for the returned result."
  },
  "outcome": "complete",
  "summary": "Fresh independent high-risk review cleared the exact control-tag guard correction with no findings. The reviewer verified the dispatcher/tag, signing-lock entrypoint, receipt identity and durable upload claim boundaries, and independently passed all 13 upload-configuration tests, including the real script with seventeen rejected variants, plus shell syntax and diff checks. No Apple request occurred.",
  "findings": []
}
```
