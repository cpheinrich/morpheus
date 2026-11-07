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
QMD remains an optional comparator whose added complexity needs empirical justification.

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
