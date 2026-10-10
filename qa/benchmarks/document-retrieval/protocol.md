# Document retrieval evaluation protocol

Recorded before scored runs, 2026-09-24.

## Scope

Thirty author-curated questions per private project, spanning exact record lookup,
conceptual rules, operational evidence, historical failures and changed decisions.
This is a document-discovery task, not a production implementation or code-graph
benchmark. Questions are selected from source records, not real held-out user logs.
The author knows the corpora; this selection bias limits generalization.

Freeze Git snapshots and question/evidence JSON with SHA-256 before searching.
Include tracked Markdown under .agent/decisions, .agent/learned, .agent/worklog,
the decisions/learned indexes, hq/product and docs. Include root AGENTS.md as
agent-instructions.md so archived instructions do not become execution directives.
Exclude source code, inboxes, research-result data and private user media.

## Search engines

Use QMD 2.8.3 with its default embedding, expansion and reranking models.
Measure BM25, vector, structured lexical+vector without reranking, structured
lexical+vector with reranking, and full automatic expansion+reranking. Give every
mode the same natural-language question; structured modes additionally receive
the same prewritten keyword query as BM25. No tuning after seeing results.
Measure document recall at 5 and 10 and reciprocal rank. Deduplicate file hits.
Evidence groups allow equivalent sources; each required group counts once.
Document recall alone cannot establish that a relevant section was retrieved.
Record initialization/indexing separately from search. Cold-first and subsequent
queries are separate observations. Do not call a repeated cached query cold.

## Paired agents

One ephemeral Codex session per question per arm. Same configured model and
reasoning effort, same frozen files and instructions. Ordinary rg, file listing,
indexes and reading are available in both arms; the augmented arm additionally
has QMD's native local MCP tools, without auto-expansion or reranking. Agents can
reformulate searches. They return at most six citations with exact source quotes.
Gold files and other runs are outside their working directory and prohibited.

Counterbalance baseline-first and QMD-first by question number. Run sessions
serially to avoid artificial local-model contention. Impose a 120-second
wall-clock cap, including startup; keep timeout/error rows in the denominator.
Recommend at most eight search/read calls, not enforced as an independent metric.
No credentials, network research, writes, code changes, or subagents are needed.

Primary agent metric: macro-average fraction of required evidence groups supported
by a submitted exact quote inside a frozen gold section, minimum 30 normalized
characters. This measures retrieval of evidence, not factual answer correctness.
Equivalent sections are specified before runs. Additional legitimate sources
outside that set may be scored as misses; inspect discordant cases and disclose.
Do not award credit merely for naming the decisions file.

Report wall-clock latency, complete-evidence rate, timeout/error counts, tool calls,
tool-output characters and provider-reported input/cached/output tokens. Input
usage can count repeated context across turns; it is not unique document size.
One observation per question per arm is exploratory, not a stable latency SLA.
Report paired differences and uncertainty without claiming causal generality.

## Publication

Publish scripts, opaque per-question IDs/categories, hashes and aggregate results.
Keep private fixtures, quotes, source paths and raw transcripts locally. Exact
reproduction requires authorized access to those private fixtures and revisions.
No full public reproducibility or externally validated gold-label claim is made.
Keep the PR open; this study does not authorize adoption.

## Setup probes

A non-scored shell probe established that the read-only sandbox cannot open QMD's
writable SQLite/WAL database. Use the package's native MCP server, which owns its
index outside shell execution, rather than loosening the shell sandbox. No question
or gold label was selected using this probe.
