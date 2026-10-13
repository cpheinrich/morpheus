# Remove the iOS visual QA gallery PR publisher — MO-26-09-28-18.35.26

## Review record

Independent normal-risk review of removing the reusable nightly iOS screenshot gallery publisher. The reviewer confirmed no Morpheus code, workflow, template or dist references the removed files, that only Evo and Kairos called it and their open PRs remove those callers, that the stated merge order is necessary and sufficient, that ios-nightly-build behaviour is byte-identical apart from a description, and that the guard test is correct. It cleared the change with two minor text findings, both fixed without behaviour change.

```morpheus-review
{
  "version": 2,
  "base": "abdd985f37c5f3c7f76a3877e69fbabd8499b821",
  "reviewed": "2b22dfda7cd216579c7f59c96ca5164dfdd05cff",
  "covered": "0c56776fe6de1c46ac198eae2f4774629376b1d2",
  "authorSession": "13749f2d-ae1e-40b5-8930-44ed54b327a3",
  "reviewerSession": "a6a075183e564c0fc",
  "risk": "normal",
  "elapsedMinutes": 1.3810333333333333,
  "timing": {
    "source": "runner",
    "durationMs": 82862,
    "evidence": "Agent tool result usage.duration_ms for the independent review invocation: 82862."
  },
  "outcome": "complete",
  "summary": "Independent normal-risk review of removing the reusable nightly iOS screenshot gallery publisher. The reviewer confirmed no Morpheus code, workflow, template or dist references the removed files, that only Evo and Kairos called it and their open PRs remove those callers, that the stated merge order is necessary and sufficient, that ios-nightly-build behaviour is byte-identical apart from a description, and that the guard test is correct. It cleared the change with two minor text findings, both fixed without behaviour change.",
  "findings": [
    {
      "id": "MO304-F1",
      "severity": "minor",
      "disposition": "fixed",
      "paths": [
        "architecture.md",
        "hq/product/roadmap/MO-26-09-28-18.35.26-remove-ios-visual-qa-publisher.md"
      ],
      "description": "Section 18 said named attachments are kept in the run xcresult uploaded with its artifacts; the xcresult is uploaded only on failure and screenshots are exported into the ios-screenshots-<run>-<attempt> artifact kept 14 days.",
      "response": "Section 18 and the roadmap Approach now name the ios-screenshots artifact, its 14-day retention, and that the full xcresult is uploaded only when tests fail."
    },
    {
      "id": "MO304-F2",
      "severity": "minor",
      "disposition": "fixed",
      "paths": [
        ".github/workflows/ios-nightly-build.yml"
      ],
      "description": "The comment on the no-op marker step still justified it by the removed observer.",
      "response": "Reworded to say it records an intentional skip so a run with no screenshots is distinguishable from a failed capture; the step itself is unchanged and workflow tests pass 150/150."
    }
  ]
}
```
