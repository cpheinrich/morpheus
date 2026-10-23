# The research record

Read this when starting an experiment series, before publishing results, and before the pull
request. A project's own benchmark plumbing (ledger, report format, storage) takes precedence over
these shapes; use them where the project has none.

## The plan (write it before the first paid run)

| Field | Content |
|---|---|
| Question | The function being estimated, its inputs and output, and the decision the result informs |
| Prior work | The literature review's takeaways, published targets, datasets and their licences |
| Benchmark | Dev and locked sets with case digests; ground truth and how it was obtained; the metric and why it matches the use |
| Baseline | What ships today, scored the way it ships, and its repeat noise |
| Variants | At least four for the first round, each with the hypothesis it tests |
| Selection rule | Declared before the final run: the metric, the noise band, the tie-breaks (cost, latency, simplicity) |
| Budget | Paid calls by provider, as granted or as the project's standing policy allows |
| Anti-overfitting guards | What will not be used to choose (single cases, the locked set) |

Critique the draft yourself — or have a fresh reviewer critique it when the stakes warrant — and
record what changed. A plan with no critique section was not critiqued.

## A ledger entry per run

Name, date, code commit and whether the tree was dirty, corpus name and case digest, baseline run,
hypothesis, change, the headline metrics with signed bias, the verdict against the noise band, and
a pointer plus digest to the per-case outputs in private storage. Write the hypothesis before the
run.

## Results tables

- Before and after, one row per variant: accuracy (with its interval), signed bias, cost per
  thousand uses, latency at the median and 90th percentile, and failures or fallbacks.
- One sentence under the table defining each metric and column.
- The canonical example's concrete numbers when the person has one.
- For a comparison inside the noise band: the pooled interval, and the split by whether the change
  altered each case.

## The worklog

- What was asked, in the person's words, with the date.
- What was built, as paths with one line each.
- **Dead ends and surprises**: what the code does not show — failed methods and why, provider
  quirks, data problems, misleading tests and how they were caught.
- Results, the spend by provider, and the exact commands that reproduce them.
- Open questions and follow-ups, each tracked where the project tracks work.

## Reproducibility

- Paid collection is resumable and separate from scoring: anything stored is never paid for twice.
- Scoring is offline and deterministic from stored answers, and reproduces the published tables
  exactly. When a fresh collection would sample a stochastic model anew, say so beside the tables.
- Private data stays out of the repository; its location and how to rebuild it are written down.
