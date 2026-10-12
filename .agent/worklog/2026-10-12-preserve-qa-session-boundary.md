---
roadmap: MO-26-10-12-12.21.28
---
# Keep comment QA changes together

Verified #363 against both skill copies, the generated template and QA_GUIDE. Moved the session
boundary before the procedural short form and to the guide's first section. It explicitly keeps
batches on one claimed branch with local commits, defers push/PR/review/CI until the person ends
the session, and requires notice before rebuilding, relaunching, reloading or navigating.

Used skill-creator guidance for a narrow correction to the existing skill. No new behavioral
unit test for a prose-only change: the existing skill/template consistency checks protect
scaffold propagation, and independent review assesses the operative instructions. Graph transport
and coverage calls failed, so exact source/template/tests were inspected directly.

Validation: frozen install;149 focused tests across qa-preview/init/qa-web; typecheck,compile,pm index,lint,inbox and diff checks passed. Both skill folders passed skill-creator quick_validate using uv with PyYAML (system and bundled Python lacked yaml). Merged current main before review; full pnpm test passed2110tests/75files in66.32seconds. No UI behavior changed, so no simulator/browser session was needed.

Independent review cleared the exact remote head with no findings. The session boundary precedes both the short-form steps and full-guide setup; installed skills, scaffold, compiled guide and declaration agree. The reviewer independently passed two focused scaffold consistency tests and verified generated/excluded paths directly. No command behavior changed.

```morpheus-review
{
  "version": 2,
  "base": "d1eeacce7a3cf3d1271ad8592d9769c4b7ec0cdd",
  "reviewed": "2089a5146a3a9bf944052d99110e37ff4b794ce8",
  "covered": "2089a5146a3a9bf944052d99110e37ff4b794ce8",
  "authorSession": "01a1317d-1201-7161-a2b9-b09e0a7fe8ab",
  "reviewerSession": "/root/review_qa_session",
  "risk": "normal",
  "elapsedMinutes": 2.7948333333333335,
  "timing": {
    "source": "clock",
    "durationMs": 167690,
    "evidence": "Reviewer /root/review_qa_session invocation start 2026-10-12T19:27:26.757813+00:00; completion observed 2026-10-12T19:30:14.447028+00:00."
  },
  "outcome": "complete",
  "summary": "Independent review cleared the exact remote head with no findings. The session boundary precedes both the short-form steps and full-guide setup; installed skills, scaffold, compiled guide and declaration agree. The reviewer independently passed two focused scaffold consistency tests and verified generated/excluded paths directly. No command behavior changed.",
  "findings": []
}
```
