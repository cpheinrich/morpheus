---
roadmap: MO-26-09-11-10.23.27
---
# Clarify who starts and manages independent review

The main AGENTS.md still described the historical review-on-open workflow without qualifying it
as legacy, despite the new independent-review runbook. Clarified author dispatch, history isolation,
packet-only preparation, findings/follow-up ownership, evidence and merge in the live instructions,
scaffold, PR template, canonical reviewer prompt and architecture. CI remains deterministic.
Existing authored instructions are not overwritten by init; the runbook names the explicit rollout.

Validation: pnpm typecheck; pnpm test (46 files, 1,299 tests); pnpm compile;
pnpm morpheus pm index. The scaffold test checks the actual generated ownership instructions.
No new generic capability or dependency was introduced.

## Cross-project caller audit

Read live main-branch workflow files through GitHub on September 11. Evo already grants contents
and pull-requests read in pr-check.yml; #211 still adds the metadata-only edited/labeled/unlabeled
workflow. Lakina, cpheinrich.com, Kairos and mor.llc call pr-check.yml without explicit grants and
lack the metadata-only workflow. Lakina's repository default is write (so omission alone does not
prove a permission failure); cpheinrich.com's is read. Explicit job grants avoid reliance on those
defaults. Darwin and Babel currently do not call the shared PR check, so this specific permission
regression does not apply. This audit does not claim their overall review policy is fully rolled out.

## Independent review

Independent reviewer /root/review_morpheus_ownership completed the small-risk review in approximately 0.7 minutes with no findings. No fixes, disagreements or second pass were needed. The reviewer inspected source and generated instructions without rerunning tests; cross-project audit evidence was read from the worklog rather than independently queried.

```morpheus-review
{
  "version": 1,
  "base": "550311ed313df02f4231f20ed4eb8e5cb2091ebb",
  "reviewed": "dbaf69b820748ab53783bbd1f4a7615cfbc143ff",
  "covered": "dbaf69b820748ab53783bbd1f4a7615cfbc143ff",
  "authorSession": "/root/01a0917b-9b17-7840-846a-60c0418c4b31",
  "reviewerSession": "/root/review_morpheus_ownership",
  "risk": "small",
  "elapsedMinutes": 0.7,
  "outcome": "complete",
  "summary": "Independent reviewer /root/review_morpheus_ownership completed the small-risk review in approximately 0.7 minutes with no findings. No fixes, disagreements or second pass were needed. The reviewer inspected source and generated instructions without rerunning tests; cross-project audit evidence was read from the worklog rather than independently queried.",
  "findings": []
}
```
