# QMD performance tuning, 2026-09-25

User-directed extension of the exploratory study, not a confirmation of its prior
recommendation. Find a worthwhile fast configuration for an Evo-sized corpus.
Preserve the September 24 observations unchanged. Keep all private data local.

## Optimization And Validation

- Use the original 30 Evo questions as development data. They are not held out.
- Inspect pinned QMD implementation and upstream guidance. Tune query recipes,
  candidate counts, reranking, transport/lifetime and retrieval workflow. Do not
  patch QMD or create a production frontend.
- Compare normalized BM25, short/multiple lexical queries, vector, hybrid without
  reranking, and bounded reranking. Measure labeled document coverage and passage
  access; returning a monolithic decisions file is not enough.
- Compare native persistent HTTP query latency with direct ripgrep subprocesses.
  The regex baseline is candidate discovery, not relevance ranking. Expose the
  different output volumes and semantics, not just a misleading speed ratio.
- Use new source-authored questions for validation, including specific worklog
  details missing from the old canonical-record-heavy sample. Freeze questions and
  required passages before any validation search. Development may change freely;
  publish the chosen policy before held-out agent runs and do not retune on them.
- Compare an efficient ordinary-search agent against the chosen QMD workflow with
  the same existing configured model/effort, frozen corpus, brief answer format,
  resource limit and citation task. Allow ordinary fallback in the augmented arm.
  Run serially, counterbalance order, and repeat each pair twice. Keep failures.
- Retain monotonic arrival timestamps for streamed tool events. Separately report
  question-to-evidence delivery, first-tool-to-evidence, and full completion time.
  Evidence-delivery time is retrospective: the first completed tool event by which
  all valid final cited gold passages were available, not when the model understood
  them. Quotes must be verified against source files. Misses never get a fast-time
  success credit. Include success-by-deadline curves and a 120-second cap.

## Decision Rule

A worthwhile candidate should maintain at least baseline recall minus five
percentage points, and at least 95% absolute evidence recall, while halving median
question-to-evidence time AND saving at least five seconds. Inspect paired ratios,
repeat consistency, tail latency, output volume and startup costs as well. These
are practical exploratory thresholds, not a statistical power claim. A large
sub-millisecond backend speedup alone is not an agent-workflow adoption win.

This is tuning, not an exhaustive search of all models and settings. Distinguish
measured failures to meet the target from claims that no possible setup can win.
Author-written questions and incomplete alternative labels remain limitations;
post-hoc source adjudication is separate and never rewrites frozen scores.

## Publication

Extend open PR #265 with a new report, scripts and allowlisted measurements. No
private questions, passages, paths, raw responses or transcripts enter Git. This
new user-requested scope receives a fresh independent review before republishing
the reviewed attestation. Leave the PR open with auto-merge disabled.
