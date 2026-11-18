# Review replay pilot

This evaluation compares targeted defect detection and avoidable reviewer requests with equal
weight. The report is [Review replay pilot](../../audits/2026-11-18-review-replay.md).

- `packets.json` contains twelve anonymized, hand-reduced PRs from historical incidents.
- `rubric.json` contains the adjudication criteria and historical consequence labels. Give workers
  the packets and assigned policy only. Keep the rubric, historic reviews and later fixes out of
  their input.
- `manifest.json` pins the packets, rubric and two policy sources. The candidate was fixed before
  looking at outputs. Both arms use the same gateway, requested model, effort and response shape.
  `candidate.patch` reconstructs the tested rewrite. It applies to the frozen baseline with
  `git apply --unidiff-zero` in a disposable checkout of the base revision.
- `results.json` contains the masked adjudication relabeled by arm. `score.mjs` rebuilds the paired
  counts from those labels.

## Protocol

Assign fresh sessions one policy each. Give both arms the same six packets in the same order per
group, with each packet treated as an independent initial review. Repeat from a fresh session with
the order reversed. Require one result per case with a completion status and every reported
finding's severity, location, scenario and requested change. This protocol isolates reviewer
judgment on supplied evidence. It leaves repository discovery, execution of tests, later reviewer
turns and author responses for further validation.

Have a grader who cannot see the arm mapping match findings to the rubric. Credit a target when
the finding describes its real mechanism and consequence, and record distinct remediation flaws
outside the detection score. Count a case once on the waste axis when any recommendation is
unnecessary or harmful:

- **False blocker**. A substantive finding with a disproved or unsupported premise.
- **Redundant change**. A requested change without demonstrated value for behavior, reliability or
  acceptance. Record actual reviewer-caused code separately from prospective suggestions.
- **Nit**. A low-value optional request with no concrete benefit. A recorded nit becomes observed
  delay only when review and commit history establish the specific additional work or turn.

Keep valid secondary findings, including genuine acceptance and safety evidence, as controls.
Record incomplete and missing output as unknown. Use the actual unit of causation (a retracted
blocker, an attributable edit, an extra test, etc.) for historical impact. Silence in a worklog
cannot establish that no waste occurred.

```sh
node --test qa/evals/review-replay/score.test.mjs
node qa/evals/review-replay/score.mjs qa/evals/review-replay/results.json
```

For a new round, hold out whole PRs and mechanisms from prompt development. Put every reported
finding through masked grading, record dissent and report the two axes separately.
