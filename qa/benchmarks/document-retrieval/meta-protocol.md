# Metadata-aware MiniSearch follow-up

The fourth study asks whether record metadata makes lexical prefetch fast enough to
matter. The previous round's plain MiniSearch prefetch saved a median 5.74 s (1.33x)
against ordinary navigation. The adoption bar is unchanged: median paired **2x and at
least five seconds saved**, audited evidence recall of at least 95% and no more than five
points below ordinary navigation.

## Arms

- **baseline** — ordinary rg/Grep/Glob/Read navigation. No retrieval is supplied.
- **prefetch-mini** — the previous plain MiniSearch control: whole documents, path as
  title, four 3,000-character windows before the first model turn.
- **prefetch-meta** — the same timing and a 12,000-character total budget, plus metadata:
  identifiers kept whole and looked up directly, frontmatter titles and summaries, headings,
  record type, date and status in each passage, heading-level windows in long records,
  worklog/roadmap bundling, and a current-versus-historical ranking prior.

Every arm uses the same model, effort, tools, answer schema, 80-word limit and citation
rules. The prompts differ only in the supplied passages and, for metadata, one sentence
explaining the passage fields.

## Agent runtime

The previous studies used Codex. This round must not spend more Codex benchmark calls, so
the agent is Claude Code on the Max subscription: `claude -p --safe-mode`, which disables
CLAUDE.md, skills, plugins, hooks and MCP servers. Provider and parent-session variables are
removed. Authentication is `claude.ai`; the organization's overage is disabled, and the
harness stops before the next trial on an overage signal or 80% utilization of any window.
Each trial has a fresh, non-persistent session in a read-only copy of the frozen corpus.

The primary model is fixed as **Opus 5.5, high effort** before any Opus timing is seen,
because it is the model normally used here for Claude sessions. A Sonnet 5.5 pilot is kept
as a development observation. Claude timings are never pooled with the earlier GPT timings.

## Development, then freeze

Tuning uses only questions whose labels were already exposed: 30 Lakina and 30 Evo authored
questions, 20 Evo tuning-holdout questions and 30 Evo history-derived questions, all against
the earlier frozen snapshots. Measure document recall and **window recall**: whether a
returned passage from a labelled source contains a quotable (≥30-character) fragment of it.
Freeze the retriever by SHA-256 before writing any held-out question.

## Held-out questions

Derive twelve questions per project from user messages in local Codex and Claude histories
between 2026-09-24 and the new trunk snapshots. Those messages postdate every earlier question
pool. Snapshot each project's current trunk. Write each question, its required facts and its
evidence passages (including equivalent alternatives) from the records, and freeze them by
SHA-256 before any retrieval or agent trial touches them. Questions ask about requirements,
decisions, causes and current state, not about naming a file.

## Trials and scoring

Twenty-four questions, three arms, two repeats: 144 sessions, counterbalanced as before.
Complete time runs from before retrieval to process exit. Preserve every failed or timed-out
trial in the denominator. Report p95, tool calls, model turns, token usage and the time the
structured answer was emitted, as well as completion.

Strict recall uses the frozen passages. A blinded audit, which sees neither arm nor timing,
judges whether each answer states the required facts and whether a valid cited quote outside
the frozen passages supports a fact group. Publication reports both scores.

Raw questions, history, provenance, quotes, answers and audit reasons remain private.
Public output is an allowlist of numeric metrics, opaque question IDs and hashes.
