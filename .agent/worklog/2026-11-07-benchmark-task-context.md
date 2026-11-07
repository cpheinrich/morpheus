---
date: 2026-11-07
agent: codex
roadmap: MO-26-10-28-14.10.57
tags: [engineering, research, agent-workflow]
outcome: research
summary: "Lead task-context retrieval design and Evo-first benchmarking before production adoption."
---

# Task-context retrieval research

Chris requested the agentic CTO skill, substantial design and benchmark iteration, and preliminary
results for his review before production adoption. The primary outcome is less irrelevant context
at task startup with reliable retrieval of the decisions, lessons and architecture needed to work
correctly. Tags guide retrieval; they must not become knowledge walls. Slightly excessive context
is preferable to consequential omissions. Reuse the existing HQ search implementation when useful;
QMD is a required benchmark comparator. Production adoption depends on measured benefit.

## Mandate

- Outcome: an independently critiqued proposal and reproducible preliminary Evo results for recall,
  retrieval time, context tokens and, where authorized and feasible, whole-task performance.
- Current milestone: benchmark and refine a research prototype. Do not activate a new startup
  protocol, CI tag requirement or historical migration before Chris reviews the preliminary result.
- Authority: ordinary research/prototyping and task records in an isolated claimed Morpheus checkout;
  read authorized Evo/Lakina/project history. Existing review, privacy and protected-branch rules
  remain. No production mutations, repository-wide record rewrite or inherited-record duplication.
- Budget: no new monetary spend, paid API or overage is authorized. Existing local computation and
  installed dependencies may support deterministic measurement. Factory routing and included-quota
  model trials were asked as one explicit question because the user's instructions keep this
  native Codex subscription controller-only and Factory opt-in; record the actual answer before use.
  Another engagement's allowance or old benchmark capacity is not this project's budget.
- Delegation: research follows the research-engineer skill; the root owns mandate, protocol,
  supervision, acceptance and verification. Independent design critique and labeling must remain
  distinguishable from method implementation. Worker project/worktree/permissions/gateway/quota
  are verified before launch. No automatic substitution of a native author or paid provider.
- Reporting: meaningful findings, changed design and preliminary evidence in this chat; all failures
  and limitations retained in the research record. No new automation or external notification.
- Stop at this milestone: a reviewable preliminary report with reproducible measurements and
  remaining uncertainty, or a precise dependency requiring Chris's answer; independent work continues
  while that answer is pending. Do not present proposed targets as achieved measurements.

## Prior evidence and initial design

The existing split-records item is the delivery association; this research extends its plan instead
of opening a duplicate implementation claim. The initial investigation recovered the original
workforce discussion and the QMD/MiniSearch benchmark in PR265. That PR remains open and unmerged;
it is reference evidence, not adopted production code or a task to merge in this engagement.

The September29 follow-up at PR head9b74db196d686198f425656af7a11155d152f644 found only0.31s
paired incremental saving for metadata-aware MiniSearch over plain prefetch, with mixed answer
quality. Crucially, those sessions disabled ambient instructions and mandatory startup records;
they do not measure replacing today's large mandatory full-record reads. Their questions and
labels are exposed prior evidence and may inform development only, never a new held-out claim.

Morpheus's current headless HQ engine already indexes title/path/headings/metadata/aliases/full text
and emits bounded excerpts. Source adapters/catalog membership remain project-owned. Agent search
should reuse the engine with suitable local inputs, freshness and ranking, rather than blindly use
a deployed browser corpus or index. HQ's custom sourceWeight currently replaces exact-identity
precedence; agent ranking must preserve that lookup deliberately. The default search combines terms
with AND, so a flexible agent policy needs measured broadening rather than silently empty results.

Proposed flow: universal invariants + task/role/paths -> broad lexical/tag/link selection -> current
governing records and related history -> work -> expand when scope changes or evidence is weak.
Broad tag preferences never exclude an otherwise strong match. Split decisions/lessons into
individually addressed records; preserve the original bodies and supersession relationships.
Architecture starts with selected anchored sections, not a mandatory physical rewrite.

The provisional target is75% fewer repository startup tokens with no critical-context loss in the
evaluated tasks. This is a hypothesis. Default context allocations are not runtime exclusion gates.

## Pre-experiment protocol, draft1

This draft precedes new retrieval tuning or model-based collection. A fresh critique and ground-truth
audit should amend it before the held-out freeze. All case text, source bodies and private per-case
outputs stay outside public Morpheus records. Public reports may contain synthetic fixtures and
opaque case/source identities, digests, counts and aggregate numbers.

### Inputs, truth and split

The retrieval function takes a real task request, declared role/tags when available, affected paths
and an exact authorized repository snapshot. It returns evidence windows plus source identities,
selection reasons, byte/token counts and additional-context paths. It may expand its search; all
expanded context and time count against the same task. Code graph discovery remains separate and
does not get replaced by document retrieval.

Aim for24development and24held-out tasks grouped by originating task/thread/incident, covering iOS,
backend/auth, DevOps, ML/RGB-D, product/design, marketing/ASO, health and inherited privacy/legal.
Use real retained task requests and acceptance evidence, including tasks after the old benchmark's
collection window. Variants of one underlying incident never straddle splits. Do not simply turn
decision headings into queries. Known historical benchmark questions belong to development only.

Each case needs independently checked required-fact groups with acceptable alternative source
spans, separately marked critical constraints, current/historical intent and its evaluation date.
Truth derives from primary project records and actual task acceptance, not retriever outputs or
uncorroborated agent recollection. Model-assisted labels are explicitly model-assisted; they are
not human gold. Preserve disagreements and the judgment that resolved each one. Pin corpus and
case-list digests, source revisions, taxonomy and label version before tuning or held-out runs.

Include intentionally misleading or absent tags, vocabulary changes, exact IDs, superseded
recommendations, body-only changes, newly added governing records and cross-domain requirements.
No precise test query or hidden label is available to the method author after the test freeze.

### First-round variants

1. Current startup contract plus ordinary source navigation, with the required full decisions,
   lessons/instructions and architecture read where the project currently requires it.
2. Split records and a small universal brief, using ordinary text search and explicit references.
3. The same split/universal context with reused HQ MiniSearch and no tag-based ranking preference.
4. The same engine with broad tag/role preferences, exact identity and linked-record expansion.

Vary passage allocations on development, e.g.5k/10k/20k fixed-tokenizer tokens. These are experimental
conditions, not permission to omit governing rules in a real task. Record overflow and additional
reads. Include an ablation separating file splitting from ranking, and one separating tags from
linked-record expansion. QMD can become a fifth backend if development misses suggest semantic
retrieval could help; preserve cold/warm/model-load/maintenance costs and use the same corpus and
output allocations. A failed variant stays in the report.

### Metrics and accounting

- Required-fact evidence recall: fraction of labeled required-fact groups for which the retrieved
  material actually contains sufficient evidence, allowing documented equivalent sources.
- Critical recall: every designated applicable health/privacy/authority/current-decision constraint
  must be present in the evaluation. Finite-set success is not a claim of universal completeness.
- First-pass versus post-expansion recall, supporting-context precision and superseded-rule errors
  are reported separately. A source filename without the necessary passage is not retrieved evidence.
- Context size: bytes and fixed-tokenizer tokens for universal startup, selected passages and extra
  reads; both unique content and cumulative exposure are reported. Provider-reported input/cached/
  output usage, when available, is separate; a tokenizer proxy is not exact model billing.
- Latency: index build/update, cold load, warm lookup, time to sufficient evidence and complete task
  time; report medians and upper percentiles. Do not compare warmed in-process queries with a cold
  baseline and call it an algorithmic gain. Include all failed/time-limited attempts in denominators.
- Outcomes: independent task/rule compliance, supported answers and repeated-known-failure rate.
  A successful retrieval lookup is not a successful coding task.

The full-read baseline may exceed a model's real usable window. Report that as infeasible for that
configuration, retaining its measured size; never truncate it silently or score it as an ordinary
completed model trial. Source reads required later for implementation are measured separately from
startup. This study changes repository-supplied context, not platform tool catalogs or system prompts.

### Iteration and selection

Start with a small development smoke test to validate source mapping, passage accounting, exact-ID
behavior and failure reporting. Repeat baseline timings to measure machine/provider noise. Tune
only on development; retain every variant and mutation. Freeze one finalist before the held-out
milestone. Use paired cases with counterbalanced order and multiple repeats for model trials.
Bootstrap uncertainty over independent originating task groups, not duplicated prompts or repeats.
Report per-domain/provider results and all critical misses, not just a pooled average.

Prefer the simplest Pareto-competitive method: critical recall first, then no material degradation
of supported task outcomes, then context reduction; latency, maintenance and implementation size
break close ties. The75% token-reduction hypothesis must not trump quality. Provisional95% useful
recall is a reporting target, not enough to waive a single critical omission. If differences remain
inside the measured noise or labels are unsettled, report an inconclusive comparison.

### Critique before running

Risks identified by the root: artificially large baseline savings from a nonrepresentative mandatory
read assumption; oracle task tags or hidden facts leaking into query construction; reusing exposed
old benchmark questions as holdout; document-level success masking missing passages; forcing a
single org branch; fixed summaries hiding a deep match; current-state ranking leaking into historical
tasks; and measuring only answer snippets instead of implementation decisions. The controls above
address these, but an independent reviewer must still critique the protocol and source labels.

## Work completed at intake

- Read existing project records and recovered historical benchmark findings; produced a preliminary
  user-visible design report outside the public checkout.
- Checked HQ/tag/session source through the indexed primary checkout. Tier2 evidence paths had no
  recorded gaps and matching metadata at graph generation2026-11-07T07:10:01Z; best-effort only.
- Prepared and claimed this item's isolated worktree through pm claim. Its automatic reconciliation
  also updated the already-merged complexity-enforcement item; do not confuse that bookkeeping with
  research work performed here.
- The initial oversized record reads were not eligible for read-evidence credit. Re-read the
  required records in bounded chunks and obtained the normal certified receipt; no evidence bypass.
- Initial fresh local corpus inspection confirms Evo's decisions/lessons total460602bytes; this is
  a size observation, not measured session input or a retrieval-quality finding.
- No new retrieval benchmark, independent label audit or model-based trial has completed yet.

## Next evidence

Freeze exact corpus manifests and token-count baselines; obtain independent protocol/label critique;
run development comparisons with reproducible case outputs; refine and run a held-out milestone;
bring preliminary results to Chris before policy activation or migration.

## Intake measurements, not retrieval acceptance

Deterministic local measurements now completed on an immutable pilot-corpus snapshot:

| Measurement | Observation |
|---|---:|
| Pilot Markdown documents in the declared context scope | 1436 |
| Full pilot corpus bytes | 8366132 |
| Full pilot corpus fixed-tokenizer tokens | 2051544 |
| Required local startup records, fixed-tokenizer tokens | 118305 |
| Startup plus required upstream instructions/specification, fixed-tokenizer tokens | 187928 |
| Existing HQ engine index construction | 696.60ms |
| Serialized HQ index | 5599545bytes |
| Five in-process serialized payload loads | 209.13–220.56ms |
| Warm query median / p95 | 1.60ms / 3.82ms |

Token counts use tiktoken0.14.0/o200k_base as a fixed comparison proxy, not the model's actual
billing tokenizer or proof that every session reads all required bytes. Snapshot manifests and
SHA-256 identities retain source provenance privately. The tokenizer and its dependencies were
installed only into the private research artifact directory, not a project/global environment.

The existing-engine measurement uses6controller-selected exploratory queries,8result slots and
20measured warm repetitions per query after one warmup. Record parsing surfaced2existing malformed
frontmatter inputs, kept visible rather than silently discarded. Source text remains indexed even
when frontmatter metadata cannot be parsed. The driver checks the frozen source hashes and the
engine revision before running, and uses the existing compiled HQ builder/loader/search functions.
Raw per-query results and the measurement driver remain in private local research artifacts.

These numbers show that the existing engine can load/search the corpus cheaply; they establish
neither evidence recall nor improved task outcomes. Repeated payload loads are not cold-process
measurements. No new relevance labels, held-out retrieval run, independent critique or model trials
have completed. Factory/model-trial authorization remains pending; do not infer it from elapsed time.

Record validation performed: morpheus pm validate, morpheus pm index and git diff --check.
Application tests do not apply to these mandate/measurement records. No claim of production-tested
retrieval, reduced actual session tokens or completed migration is made.

## November 7 steering and first development screen

Chris authorized Factory using included subscription quota and suggested GPT-6 Luna for the
relative model comparisons. He asked for historical tasks, a tag sample instead of a full migration,
`legal → business-records`, section tags for business meeting notes, and links to related GitHub PRs.
After design acceptance, extend canonical Google Meet intake to assign and validate the section tags
and project them through its existing catalog. Keep live service retrieval outside the first tranche.
Results can identify where an agent should check Sentry, App Store Connect or PostHog using its
existing tools. A future live adapter would need explicit source selection and observation times.

Factory Codex gateway runs 9647aa75-ff8f-40f0-a3d7-ff333e3a4061 (research screen) and
2e8ff170-3b8d-4034-b79e-c0b656d31f90 (independent design critique) ran on the MacBook Pro,
with GPT-6 Luna selected in their dispatch envelopes. The retrieval screen itself was deterministic.
Fresh critique recommended six development groups and six independently labeled held-out groups
for feasibility before expanding. Freeze each case's as-of evidence and labels, split by underlying
incident, select a 60–100-record tag overlay independently of the labels, and keep the full
eligible corpus searchable in all arms. Use fresh, matched model sessions for the downstream comparison.

The controller independently reproduced all 72 deterministic selection and score rows across six
historical development prompts and 1,436 frozen Evo documents. At 5k, 10k and 20k token ceilings,
broad lexical retrieval matched 0/6, 2/6 and 3/6 provisional evidence groups respectively.
One-hop local links tied broad search. Strict AND and a sort that put every existing tag match
first both matched 0/6 at all three ceilings. The existing tags covered 224/1,436 documents.
The screen selected whole documents and used provisional source-file labels, with task closure
exclusions rather than a full historical corpus reconstruction. Treat it as a diagnostic.
The next comparison will score actual passages, use bounded tag boosts, and separately verify
repository-qualified PR traversal at the task cutoff. Record omitted governing constraints.

Verified all six canonical Darwin meeting notes in Evo's discovery catalog against the catalog
revision and digests. The next corpus adds those sources, with a private heading-level overlay.
Compare meeting-wide and section tags on the same passages. Keep title, date, source revision and
heading in every result, with a path to the full note. Add a case that requires multiple sections
and another that follows a decision to its implementing or verifying PR. No new meeting
ingestion behavior, held-out run or downstream answer trial has been completed.

## November 7 benchmark sample revision

Chris rejected a 12-task comparison because of overfitting risk and proposed at least 40 tasks or
60 with a 45/15 split. Use the larger option: 45 independent historical task groups for tuning and
15 held out. Keep the original six-case diagnostic outside this comparison. Group by incident,
request and its follow-ups before splitting. Stratify across dates and domains. Require a usable
point-in-time source cutoff and evidence provenance. Keep holdout prompts and labels out of the
tuning inputs, freeze the finalist before scoring, and report counts and uncertainty by task group.
Run deterministic retrieval comparisons across all 60. Use matched GPT-6 Luna sessions for the
downstream comparison after the settings are locked, within the authorized included quota.

## Baseline, prior art and QMD comparator

The primary baseline is Evo's current startup contract and normal navigation. The prescribed
Evo-local records total 118305 tokens on the frozen snapshot, including 85530 in decisions and
20089 in lessons. Upstream instructions and architecture bring the proxy total to 187928.
Matched sessions should count the material actually received by the agent. Existing navigation
includes file and history reads, exact references, and the meeting-note search when triggered.

Cross full startup and compact startup with ordinary navigation and on-demand search. Within
the compact workflow, screen plain HQ MiniSearch, contextual heading windows, soft tags and
bounded reference expansion as separable changes. Compare QMD on the same cases and budgets
both with and without the same soft tag signal. Preserve untagged and off-tag results. Use
nested coverage targets of roughly 100 and 250 new annotations without selecting records using
held-out labels. Keep the whole corpus searchable at each coverage level.

QMD, OpenClaw and SWE-agent motivate broad query fallback and bounded source reads.
Anthropic's contextual retrieval suggests preserving ancestor headings with the passage.
Agent Retrieval Bench and NIST's relevance-judgment protocol motivate immutable base revisions,
task-oriented evidence groups and judging candidates pooled across search methods. Iterate on
development misses and stop after two targeted changes with no material gain, or when the
remaining errors require a different corpus or materially heavier infrastructure.

Recovered the earlier QMD SDK harness from PR265 at 9b74db196d686198f425656af7a11155d152f644.
Its historical-query study used 437 Evo files. Verified that QMD 2.8.3 indexed 1436 records
from the current frozen Evo manifest and returned keyword results on the six exploratory cases.
This was an index and API smoke check with one timing per prompt. The full comparison still
needs passage labels, QMD hybrid results and matched agent sessions. QMD is a private benchmark
runtime. Its setup, model loading and indexing cost are part of the comparison.

Factory run 0e201b45-633f-4f46-8eae-21af2cdb4243 on the MacBook Pro produced a provisional
60-group draw from 712 roadmap items and 624 worklogs. The controller confirmed 60 distinct
groups and mapped them to 39 pre-task first-parent Git revisions. Of 300 suggested evidence
path occurrences, 223 blobs were identical, 9 changed and 68 were absent at the cutoff. No
sampled roadmap request existed on the selected pre-task branch revision. The draw needs
intake-source verification and domain review before the 45/15 split. The six canonical Darwin
meeting bodies were already verified separately. Their publication commits still need the
same cutoff check when they are used as task evidence.

## Budget update and current-scale calibration

Chris authorized “up to 25 percent of the factory Codex workers weekly budget, and then
whatever corresponding token budget you need for the manager of Codex session.” GPT-6 Luna
and one fixed effort/settings bundle are the proposed matched-session configuration.
Use included capacity only. The root manages and verifies. Treat 25% aggregate weekly
utilization as the conservative admission threshold until engagement-level use can be
attributed. Reserve before each batch and settle from provider records. Factory's 9% weekly
Codex snapshot was last updated November 6 at 00:31 Pacific, before these runs. It cannot
settle current usage. The three bounded research runs launched earlier had no per-run quota
receipts. Further model batches wait for a current reading while local experiments proceed.

Factory runs 88c43e1d-82e9-4335-b461-37cc22cf3e5d and 0b106ea2-0bd0-47a3-b7f1-9aae9ec7d059
used the pinned Codex gateway with GPT-6 Luna on the MacBook Pro. The first delivered passage
offset plumbing. The controller checked its limits and used the actual HQ entry point and an
independent source-span/token check for comparison. The second verified eight candidate tasks
and all six pinned Darwin meeting records (53 sections). Its worklog and Git sources did not
recover the original user request for any of the eight. The controller found the earlier
project-specific intake extractor, adapted it to both historical and current Codex event
formats, and found 19 Codex and 13 Claude request candidates from the exact Evo project after
excluding threads used by the earlier study and deduplicating exact requests. These still
need incident grouping and links to independently verifiable prior evidence. The provisional
60-group Git sample is an alternate frame for clearly labeled reconstructions.

The six-case diagnostic remains separate. A second calibration reused 25 previously exposed
questions from PR265 with 30 expected quotations that still occur at their named paths in the
current 1436-record Evo corpus. Five old questions and six old evidence groups lacked surviving
quotes. Retention of a quote does not prove that its advice remains current. Normalize
whitespace only, require an exact quote in an emitted passage, and count rendered paths,
source ranges, titles and bodies in the budget. This scores known-quote coverage, not task
outcomes, critical recall or new holdout performance.

| Method | Groups found at 2k tokens | At 5k | At 10k | At 20k |
| --- | ---: | ---: | ---: | ---: |
| Default HQ ranking with passage fetch | 0/30 | 0/30 | 0/30 | 0/30 |
| Passage-body MiniSearch | 12/30 | 13/30 | 17/30 | 20/30 |
| MiniSearch with title and heading context | 19/30 | 19/30 | 20/30 | 20/30 |
| QMD hybrid without reranker | 5/30 | 10/30 | 10/30 | 10/30 |

The same soft tag rule did not change group counts for either engine at any budget. Tested
no tag boost, existing tags, and nested samples of 100 and 250 draft annotations. The draft
covers 180 source files, including roadmap, worklogs, decisions, lessons, runbooks and meeting
sections. Of 250 selected entries, 229 received proposed tags. The rules only read source
content, not task labels. Draft tag quality is unreviewed. The current Evo-only calibration
did not retrieve from the separate Darwin projection, so it does not measure meeting recall.
Both engines left all eligible content searchable. Do not infer from this result that reviewed
tags have no value for cross-domain browsing, startup rule selection or future migration.

QMD 2.8.3 embedded 4673 chunks across 1436 records with zero reported errors in 179.4 s
including first-time setup. Initial hybrid query took 1.16 s and the last four had a 40 ms
median on the six-case run. Full QMD mode completed the six smoke queries. Its first two
measurements included additional model downloads, and the last four had a 4.73 s median.
Neither compares end-to-end agent time. Model binaries, scripts, raw passages, private
request inventories and draft tags remain in private research storage.

## Follow-up calibration and case provenance

Full QMD 2.8.3 (automatic expansion, hybrid search and reranking) returned 9/30 surviving
quotes at 2k and 5k tokens and 10/30 at 10k and 20k. Existing and draft tag preferences again
left those counts unchanged. All 874 candidate chunks across the 25 questions mapped back
to the canonical source text. After the first 7.3 s query, the median warm sequential query
was 5.20 s. The corresponding QMD hybrid run had a 1.11 s first query and a 33 ms warm
median. These are local search timings. They do not measure an agent's time to an answer.

QMD hybrid retrieved surviving quotes on four calibration cases where contextual lexical
search had none at 5k. A follow-up interleaved one QMD hit for every one, two or three
lexical hits, keeping the same rendered-token ceiling. A 3:1 interleave found 18/30 at 2k,
20/30 at 5k, 21/30 at 10k and 24/30 at 20k, compared with 19/30, 19/30, 20/30 and 20/30
for lexical alone. This exploratory gain supports comparing QMD as an optional expansion
during the development round, with direct tests of when the additional lookup is useful.
No interleave setting was selected using holdout data.

Materialized the 39 immutable pre-task Evo revisions for the provisional 60 case groups,
with 1755 verified unique Git blobs and 27–1372 scoped documents per revision. This makes
the leakage-free replay possible. The complete current-scale snapshot remains a separate
capacity and continuity check. Local original-request candidates need screening and incident
grouping. A read-only Evo GitHub issue census supplied 44 further historical issue records,
of which 22 had recorded body edits. Prefer original user messages or unedited authored
issue descriptions. Record provenance explicitly when a task must instead be reconstructed
from an early roadmap item or worklog. Exclude placeholders and outcome-only descriptions.
Holdout labels and the split remain unfrozen. Retain separate historical tags only when their
source version matches the scored text, or draft them from the historical blob itself.

The bounded ripgrep control returned 8/30 at 2k and 5k, 11/30 at 10k and 15/30 at 20k.
Its median search plus passage assembly was 51.6 ms. Three fresh contextual MiniSearch
index builds took 677–692 ms. Across the 72 post-first queries, contextual ranking
took a 5.0 ms median and 10.0 ms p95 before passage budget assembly. These timing
boundaries differ, so use them as engineering costs rather than whole-workflow speedups.
Final Factory inspection still reported the same stale November 6 weekly snapshot.

## Broad deterministic benchmark

Chris superseded the small historical comparison with a common, randomly split
candidate frame, substantially more independent cases, a tested harness,
technical documentation, and a fresh independent review before the holdout.
See [the protocol and runbook](../../qa/evals/context-retrieval/README.md).
The authority remains preliminary research. Deterministic collection is local.
The previously approved Factory quota applies only to matched model trials.

The pinned corpus contains 3,781 documents across Evo, Lakina and Morpheus,
including six authorized canonical meeting notes in Evo's research scope.
Mechanical relationships yielded 1,710 queries and 805 groups. The final
allocation has 556 development and 249 held-out groups after conservatively
excluding earlier benchmark evidence from holdout. Literal and descriptive
lookups can share a group. The proposed 1,200-group holdout exceeded the
eligible census. The data underrepresent general guidance and meeting
lookups. No old calibration outcome is counted as a held-out result.

Independent reviewer findings reproduced an invalid PR namespace split,
different passage geometry, unequal shortlist placement, and insufficient
verification against original bytes. Fixed the grouping before query
deduplication, normalized source windows, made descriptive evidence the
primary outcome, added a broader QMD lexical control, and bound verification
to the original manifest and response hashes. The reviewer cleared the
corrected retrieval harness at 3479d044 after 16 focused tests, a separately
constructed tamper test and a 330-cell development smoke. Holdout requires
the complete, independently verified development matrix. Complexity passes
the enforced limit, with advisory warnings in the frame parser and validator.

The independent workflow reviewer caught corpus drift in grep and an
unbound MiniSearch socket. A private read-only verified corpus and digest
handshake addressed both. Five workflow harness tests and real tool smokes
passed. The reviewer cleared an instrumented paired pilot. Both pilot arms
receive the same compact brief. Comparing that protocol with mandatory
startup reads requires a separate full-read baseline. The accessible local
chat census has 739 possible turns across 63 threads before screening, which
does not establish a 150-task independent workflow holdout.

### Sealed retrieval result

The final frame allocated 1,212 development queries and 498 holdout queries.
An earlier development run was stopped after identifying more September
validation and held-out archive files whose evidence should force development.
The final configuration and frame were identical across development and
holdout. The independent verifier reconstructed 12,120 development and 4,980
held-out cells with zero tool errors. The scored holdout was opened only
after independent clearance and completed development verification.

| Method | Descriptive evidence recall, 1,000 | 2,500 | Total query time, 1,000 | 2,500 |
|---|---:|---:|---:|---:|
| Bounded ripgrep | 72.7% | 79.5% | 21.70 s | 31.10 s |
| MiniSearch body | 79.9% | 85.9% | 10.16 s | 19.64 s |
| MiniSearch with context fields | 84.7% | 88.0% | 9.73 s | 19.03 s |
| QMD native BM25 | 63.9% | 65.1% | 4.76 s | 5.91 s |
| QMD per-term BM25 fusion | 82.3% | 85.5% | 19.71 s | 28.56 s |

The table covers 257 descriptive queries across 249 groups. At 1,000 returned
tokens, the contextual MiniSearch difference versus ripgrep was +12.0
percentage points with a paired group bootstrap interval from +6.8 to +17.7.
Warm median time was 37.4 ms versus 82.6 ms. The Evo descriptive work-log slice
was 86/101 versus 75/101. The literal-ID file recall comparison was much closer,
95.9% versus 96.7%, and is a separate control. The contextual MiniSearch gain
is a retrieval result. This protocol does not establish the gain for conceptual
questions or real task completion. Only 16 descriptive queries were linked
section or meeting probes. Evo and Lakina had no linked-section holdout cases.
The final broad run compares lexical QMD modes. It does not compare QMD vector
or reranking at scale. Its timing is query and packaging on the local host,
with index setup recorded separately. The local private report retains per-query
responses, raw timings, setup times, source manifest digests, and run hashes.

Focused commands: `node --test qa/evals/context-retrieval/*.test.mjs`,
`morpheus complexity check`, and the documented frame, pilot, development,
holdout and Python verification commands. Runtime setup used local pinned
MiniSearch 7.2.0, QMD 2.8.3 and o200k_base tokenizers.

### Workflow instrumentation result

The final reviewed development pair used a fresh Factory GPT-6 Luna session
per arm, medium effort and Standard speed on the MacBook Pro. Both arms saw
the same read-only pinned Evo snapshot, could reformulate, and could make
ordinary search and read calls. The treatment also had MiniSearch. The audit
matched both transcripts to their exact tool traces and accepted 3/3 frozen
evidence groups in both arms.

| Arm | Factory run | Calls | Discovery payload tokens | Total input tokens | Elapsed |
|---|---|---:|---:|---:|---:|
| Ordinary | cc6d00c9-2814-4f36-a23d-ce6e4a72a3c9 | 4 | 5,182 | 153,696 | 23.743 s |
| MiniSearch available | 782ec315-fbe9-4f46-ab7a-43d5aeb51b7c | 4 | 5,309 | 151,884 | 23.889 s |

Five earlier diagnostic attempts were retained. Four failed the audit due
to the Factory envelope, tool form, a malformed long command or citation
serialization. One treatment arm passed without a valid matched control.
The final protocol uses short per-trial commands and line-range citations
whose exact source lines must have been exposed by a verified tool call.
Ten workflow tests and live tool smokes passed. The observed Factory weekly
gauge remained at 10% after the final pair. That reading does not attribute
precise quota usage to this study.

The completed pair verifies instrumentation and provides no estimate of
workflow performance. The 150-task held-out evaluation and current mandatory
full-read comparator remain outstanding. The workflow launch code, private
questions, complete attempts and audit evidence stay in the local study.
