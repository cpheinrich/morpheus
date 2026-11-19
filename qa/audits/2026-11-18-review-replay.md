# Review replay pilot

The earlier [verification audit](https://github.com/cpheinrich/morpheus/pull/735) proposed replaying
historical defects. This pilot gave the same weight to reviewer-driven waste. It used evidence
from Morpheus, Evo, Darwin and Lakina. The broader prompt rewrite did not meet the promotion rule.
Two narrow changes follow from the original-diff replay: make the authority of the trusted target
explicit in the reviewer packet, and test the public CLI's refusal when that target is missing.
The runbook also asks the reviewer and author to check the existing caller, guard and evidence
before adding work, and to leave settled minor notes closed.

## Paired results

| Measure per repeat | Current | Candidate | Interpretation |
| --- | ---: | ---: | --- |
| Target defects caught | 6 of 6 | 6 of 6 | Same six on both repeats |
| Waste cases with an avoidable request | 1 of 6 | 1 of 6 | Same case on both repeats |
| False blockers | 0 | 0 | Across both axes |
| Valid upload-tracking finding on a waste case | 1 of 1 | 1 of 1 | Both kept the useful half |
| Missing or incomplete assessments | 0 | 0 | 48 total case assessments across both repeats |

In R05, every reviewer asked to remove a permission-denial metric even though the packet already
defined delivery by a correctly placed verdict and marker. No effect of the metric on that
decision was shown. One current replay added a wording nit. The candidate did not remove the
underlying rework risk. All four reviewers detected the offline discard race in R07, but only one
explicitly put the saving marker before the SDK call. Detection and quality of the fix differ.

Two public PRs were then replayed using their original source and test diffs, with generated files
and later review records omitted. These reused two mechanisms from the reduced set. Each policy
ran once on each diff. Omitted PR bodies limited the exercise.

| Original-diff replay | Current | Candidate |
| --- | --- | --- |
| [Morpheus #740](https://github.com/cpheinrich/morpheus/pull/740), trusted review base | Found 1 of 3 historical mechanisms, the Manager's protected-path test gap. Reported it as substantive. | Found the same gap as minor. Suggested dropping the early CLI guard as an option. |
| [Morpheus #339](https://github.com/cpheinrich/morpheus/pull/339), Security check policy | Avoided the historical cancellation blocker and found a duplicate assertion. Returned incomplete and treated a post-merge receipt as substantive pre-merge evidence. | Avoided the same blocker, found the duplicate assertion and correctly left the operational receipt for post-merge acceptance. |

Both #740 reviewers missed the ref/tag collision and reusable-workflow tag precedence. Both
noticed that the predecessor's explicit treatment of candidate instructions as evidence had been
removed and that the missing-base test drove a helper only. The draft restores the instruction
boundary and adds a focused test through the same CLI command handler used by `morpheus check pr`.
Testing qualified the replay advice. Removing early resolution alone still let downstream checks
refuse the missing target. Replacing exact resolution with ordinary Git revision lookup admitted
the candidate's own waiver through a colliding tag and returned 0. The new test expects refusal
and the exact missing-target diagnostic.

## Historical work and costs

| Project | Real defect or useful verification | Avoidable work and confidence |
| --- | --- | --- |
| Morpheus | Green checks once concealed three current-head Actions runs still in progress. A scoped run census supplied the missing evidence. [Incident #449](https://github.com/cpheinrich/morpheus/issues/449) | A sole false blocker about older cancelled checks required another review on the identical source commit. That extra review took 21 seconds. An older withdrawn alert suggestion also reached a roadmap and was reverted after the author read only part of the correcting review. [#339 review record](https://github.com/cpheinrich/morpheus/blob/f52ff37f4b08aa468c45e2bb2da24813c6f79287/.agent/worklog/2026-10-06-unblock-security-bot-merge.md#L39-L61) · [#69 withdrawal](https://github.com/cpheinrich/morpheus/pull/69#issuecomment-5156932331) |
| Evo | A stale nutrition assertion passed the selected PR validation and failed the release suite after a cleared review. A separate offline review caught a queued save that could survive Discard and relaunch. | An alleged concurrent title edit triggered two failed UI test attempts against an existing editor lock and added production metadata preservation. The author retained it as defense in depth. The observed path needed no extra guard. Its value for later paths remains unknown. A separate line-width nit caused a rewrap and recurred in a follow-up that also checked a real factual correction; the entire turn cannot be assigned to the nit. |
| Darwin | Review caught a current hold hidden when the unrelated phase feed was absent. In a visual review, a clipping claim was retracted after verifying the right viewport. Recapturing valid evidence still served acceptance. | A manual archive entry would have duplicated the generated index. The author declined it. The record shows no attributable extra turn or edit. |
| Lakina | A production research workflow rejected valid offering-date evidence before publication. The repair used an existing source-bound declaration and replayed the retained input. | Review prompted a diagnostic status change that violated the consuming app's run contract. CI required the one-line revert and a measured 15.656-second corrective review. The same finding's request to track the pending upload was useful. |

These are selected cases and targeted controls. The evidence supports individual instances of
review-driven rework and added code without demonstrated value in the affected path. It does
not establish a portfolio prevalence, reachable behavior for the retained Evo guard under
future changes, or an entire PR delay caused solely by nits. The private source ledger retains
exact project revisions, finding IDs, commits and review records. The public reductions
exclude private file paths, identifiers and logs.

## Ranked follow-up experiments

1. **Test which evidence improves review at the actual entry point.**
   Hold out full PRs. Compare the same policy with and without the contemporaneous test plan,
   pointed caller and one bounded fail-before/pass-after probe. Use real release selection for
   Evo, an independent feed with scoped availability for Darwin, and actual workflow/CLI input
   for Lakina. Keep the snapshots as they were at initial review. Count critical escapes and
   tests that would still pass on the faulty state. The original-diff tag misses and the
   near-perfect reduced run make evidence discovery the best next variable.
2. **Require a concrete benefit before acting on a requested addition or deletion.** Trace
   the real caller or supported state, its current guard and relevant test. Explain a declined
   suggestion in the existing findings response. In a prospective
   trial, compare attributable edits, unwanted additions retained at merge, reverts and
   extra turns against validated defects fixed. Evo's lock, Lakina's card revert and the
   repeated R05 removal request support this trial.
3. **Measure nit cost separately from substantive rework.** Keep actionable minor notes in
   the initial pass. Sample initial and follow-up verdicts and compare unnecessary edits or
   extra turns with cases where minor feedback improved acceptance or removed demonstrated
   duplication. Compute time only when one finalization, test or review turn is attributable.
   The Evo rewrap and Morpheus false blocker illustrate why elapsed PR time alone misleads.

## Reproduction and cost

The [evaluator](../evals/review-replay/README.md) has frozen packet and rubric digests, the
original source commit, the exact tested candidate patch, paired case labels, and commands.
A grader who helped verify historical examples graded outputs with the condition mapping masked.
The author and grader knew the historical mechanisms. This was a convenience sample and a
pilot of judgment on supplied evidence. Six-case batches used fresh sessions in both conditions,
with repeat order reversed. The original-diff checks help expose packet limitations and are
excluded from the primary counts. They do not qualify as a second independent holdout.

Thirteen Factory invocations ran through the Claude gateway on the controller's MacBook Pro.
That includes one calibration, eight paired replay sessions and four original-diff sessions.
The worker reported Claude Opus 5.5, high effort and standard speed. Median worker duration for
a six-case batch was 26.0s current and 27.2s candidate. List-price equivalents in the runner
receipts were $0.79 and $0.78 for the paired arms, and $2.86 total for the thirteen invocations.
These are estimates from runner receipts rather than subscription charges or measured author
time. The primary masked output SHA-256 is
`b2c549b4a1a88dee55b38c593a86e2528e6d9a5c3f1632e95da892d9ac57a68f`.

The pilot was informed by Anthropic's emphasis on concrete checks and high-signal review.
[Verification](https://claude.dev/blog/how-the-claude-code-team-thinks-about-verification/) ·
[Code review](https://claude.dev/blog/solving-code-review-at-anthropic/)
