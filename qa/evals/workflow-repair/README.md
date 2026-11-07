# Historical workflow comparison — offline analysis

Live collection, provider launches and Paperclip API access are retired. `campaign.py` retains
only offline fixture freezing, schedule/trace parsing and plan-integrity helpers used by the
scorer; its CLI refuses collection. No new study execution is supported.

Keep cached [results.json](results.json), historical receipts and frozen study hashes unchanged.
The [report](../../../docs/paperclip-workflow-comparison.md) retains the findings and limits:
the study did not establish tool isolation or a confirmatory workflow ranking.

`score_campaign.py PRIVATE_CAMPAIGN PRIVATE_CORPUS --split locked --models-terminal` grades
already-frozen artifacts offline. The flag attests that models terminated; it launches none.
The grader uses `grading.py` and `remote_runner.py` for isolated submitted Python execution.
`summarize.py PRIVATE_CAMPAIGN` rebuilds totals without a model call. Unknown usage stays unknown.

For exact historical rescoring, use the original private archived `collector-source.py` and
`frozen-*.py` under their original basenames in a temporary directory, verified against
`plan.json`. Do not run the archived collector or rewrite hashes to match current helpers.
Current helpers differ from the archived collector by design.

Offline regression checks:

```sh
/usr/bin/python3 -m unittest discover -s qa/evals/workflow-repair -p 'test_*.py'
pnpm exec vitest run tests/workflow-repair.test.ts
```

Linux explicitly skips macOS-only Seatbelt checks. No runtime, provider, credential or
configuration mutation is part of this source retirement.
