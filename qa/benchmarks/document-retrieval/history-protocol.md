# Historical-chat follow-up

This third study changes the question source, not the prior observations. Use
private Evo user messages from local Codex and Claude conversations, excluding
unrelated projects, assistant-authored questions and benchmark sessions. Preserve
message provenance locally. Never publish chat text, titles, IDs or source paths.

Freeze thirty retrospective documentation questions before labeling sources:
ten development and twenty validation. Keep threads together across splits.
These are context lookups derived from implementation requests, not replays of
whole coding tasks or proof that documents answer live operational questions.
Record inaccessible history and scope limitations. Use the unchanged 437-file
Evo snapshot so retrieval changes are not confounded with corpus changes.

Research and screen:

- Native keyword full-source result count and output overhead.
- Automatic expansion without reranking, warm semantic lookup, and bounded
  passage return instead of whole-document dumps.
- Retrieval before the first agent turn, with all retrieval time included.
- A non-QMD prefetched text-search control, to distinguish index quality from
  removing a model/tool round trip.

Use the same agent model, reasoning level, answer format and fallback permissions
across matched arms. No model downgrade is a QMD speed improvement. Disable
ambient project-document loading for every arm when supported; disclose any
remaining runtime configuration rather than claiming clean-room isolation.
Indexing and model warmup are separate setup costs. Clear query/expansion/rerank
caches for primary first-query measurements; do not credit repeated-answer caches.

Select the final recipe on development questions only and freeze its configuration
before validation. Run baseline, the preceding keyword-CLI recipe, and the selected
new recipe on twenty validation questions, twice, counterbalancing order. Include
the prefetched non-QMD control if it is competitive in development. Preserve every
failed or interrupted attempt and include failures in quality denominators.

Primary outcome is complete answer time at verified evidence recall. The practical
target remains median paired 2x speedup and five seconds saved, at least 95%
evidence recall and within five percentage points of the baseline. Report p95,
tool turns, context volume and token counts, not just the favorable median.
Prefetch evidence availability is not comparable to an agent's recognition time;
do not call a near-zero prefetch timestamp a near-infinite useful speedup.

Frozen passage scoring and source-audited alternatives are separate. Audit whether
answers actually address each requested fact and whether returned evidence is
current enough for the retrospective question. A source citation alone is not
proof of answer correctness. Related questions/repeats are not independent samples.
Publish redacted metrics, scripts, limitations and a recommendation in the existing
open PR. No production integration, frontend, merge or background service rollout.
