---
date: 2026-10-21
roadmap: MO-26-10-21-19.17.32
agent: claude
---

# Agents operate as a scoped CTO through a reusable agentic-cto skill

## Why

Chris's CTO brief of 2026-10-18 (the Evo delivery-pipeline rebuild) asked for an "Agentic CTO
Skill" whose inputs are a brief specification, clear success criteria and budget guidance, that
"should live in Morpheus but referenced from other Morpheus projects as needed". On 2026-10-21 he
asked for it now, in parallel with the delivery campaign, consolidated with the guidance he has
given agents across Morpheus, Evo and Lakina about autonomy, initiative and upfront design, and
merged so he can use it on other projects. This Claude session is the author, delegated by the
Codex campaign coordinator; the PM session binding is that Codex task.

## Sources

Three read-only sweeps covered each repository's `.agent/decisions.md`, `.agent/learned.md`,
inbox archives, `hq/team/`, meeting notes, roadmap prose and docs, and grepped every worklog
(Morpheus 275, Evo 432, Lakina 371 files; worklogs were grep-swept with targeted reads, not read
end to end). They returned 72, 62 and 79 classified entries. The original brief was read verbatim
where Evo preserves it; the continuation's human messages were read from the coordinating Codex
session, excluding automation heartbeats and injected context. `docs/cd-pipeline-v2.md:433-436`
records the contract the skill had to carry.

Every citation that reached `references/provenance.md` was re-read at its path and line before
commit. That check corrected three things the sweeps reported: a Morpheus quote cited at
`architecture.md:68-69` is at `:63-64`; a Lakina meeting-note range included unrelated lines; and
several Lakina items attributed to Alex are accepted project decisions rather than his direct
words. Evo and Lakina are private, so the public skill cites them by path and paraphrase only.

What the sources say, briefly: Chris's direct guidance is consistent — do not park work you can do
(the browser rule), ask without blocking and with options, own review/CI/merge and the outcome,
fix rather than report recoverable failures, design from requirements after a root-cause reading
of history, prototype and get a fresh reviewer, ship an early increment, and keep spending,
publishing, sending, access and legal matters as his decisions. Lakina's standing autonomy rules
(keep going, finish around blockers, trace constraints, record in the repository) came mostly
from its other principal. Gaps: no standing numeric spend allowance exists anywhere; "act as CTO"
appears only in the 2026-10-18 campaign; there is no general instruction to use subagents beyond
that campaign and the review rule.

The campaign's own grants are deliberately not in the skill: the USD 250 provider cap, quota
thresholds, delegation below 30%, the model choice, "eight in a row", the source-age waiver, the
review-cap waiver, "ignore guardrails" and credential latitude. The mandate reference keeps their
shapes as fields.

## Design

- **Pointer, not copies.** Canonical files in `.agents/skills/agentic-cto` with a byte-identical
  `.claude` mirror; `src/cto/skill.ts` holds the same text for the CLI; `morpheus cto guide
  [mandate|provenance]` prints it; `morpheus init` writes a one-file pointer for both providers in
  every project kind, with the description borrowed from the canonical skill so both route the
  same requests. The pointer restates only the spend and gate boundaries so they hold before the
  guide is read, and names `self update` for a CLI that predates `cto`.
- Considered: copying the whole skill into each project like `motion-design-exploration`
  (simplest, but this guidance is expected to keep absorbing direction and copies drift silently);
  a pointer to the public GitHub URL (needs network and a fetch tool in every session); a plugin or
  personal `~/.codex` install (reaches one device, not a project's collaborators; plugin packaging
  stays deferred per the 2026-08-31 decision). The comment-QA skill already uses the pointer shape.
- `SKILL.md` (120 lines) holds the eight operating sections; `references/mandate.md` the fields,
  ledger rules and a labelled illustrative example; `references/provenance.md` the source table,
  what was kept out, and how tensions resolve. `scripts/sync-agentic-cto-skill.mjs` propagates an
  edit to the mirror and module; the test refuses drift.
- No new dependency: gray-matter (already used) parses frontmatter in the test; the generator uses
  Node built-ins.

## Dead ends and corrections

- The first draft copied the full skill into every project. Reading the brief's "referenced from
  other Morpheus projects" (and the Evo checkpoint's "reference from consumers") changed it to the
  pointer before any commit.
- The first `description` contained `: `, which YAML rejects — the repository's known "colon
  breaks YAML" lesson. The frontmatter test caught it on its first run; the description uses a dash.
- A placeholder test file was briefly written one directory above the worktree by a path slip; it
  and its new empty directory were removed after confirming both were this session's own.
- Mutation testing found one survivor: the pointer said "start with `mandate`", which the
  topic-resolution test could not see. The pointer now names `morpheus cto guide mandate`, and the
  same mutant fails.
- Forward evaluation found one gap (below) and the mandate reference was corrected.

## Verification

- `pnpm typecheck` passed; `pnpm compile` refreshed `dist/` (new `dist/cto/`); `pnpm morpheus pm
  index` unchanged and `pm validate` clean.
- Focused: `pnpm exec vitest run tests/agentic-cto-skill.test.ts tests/cli-dispatch.test.ts
  tests/init.test.ts tests/qa-preview.test.ts` — 4 files, 233 tests passed (the skill file has 12).
  Scope: the new module and the three suites covering init, CLI dispatch and the sibling pointer
  skill.
- Full suite once, because `src/init/templates.ts` is shared core: 96 files, 2,553 tests passed.
- The installed-shape CLI was exercised: `node dist/cli/index.js cto guide mandate` and
  `tsx src/cli/index.ts cto guide mandate` output diffed byte-identical to the file; an unknown topic
  exits 1 listing the topics.
- Codex skill-creator `quick_validate.py` (with PyYAML in an ephemeral `uv` environment): `Skill is
  valid!`.
- Mutation checks, each restored from Git afterwards — all killed: init omits the Claude pointer
  (4 failures); pointer description diverges (1); `## Budget` renamed so the anchor breaks (1);
  Claude mirror drifts (1); an orphan reference (1); guide output not byte-exact (1); colon in the
  description (2); unknown topic falls back (1); init copies a reference file (3); pointer names a
  missing topic (1, after the fix above).

## Forward evaluation

Fresh `general-purpose` agents with no task history got the skill path and one scenario from
`qa/acceptance/MO-26-10-21-19.17.32.md`, never the pass condition, and took no real action. Four
scenarios also ran without the skill as a baseline. Graded by this session against the acceptance
file.

| # | With skill | Baseline |
|---|---|---|
| 1 Initiative | Pass — re-enabled the reversible CI toggle itself, asked the debug-log question with four options and a recommendation, continued | not run |
| 2 Design | Pass — mandate, early build on the existing path first, root cause shared by both failed rewrites, idempotent requirement-led design, riskiest assumption tested, fresh reviewer | not run |
| 3 Owner | Pass — retries inside the existing controller, declined the parallel scheduler and cron, recorded build-versus-borrow | not run |
| 4 Evidence | Pass — "3 of 8 verified", upload and running job named unverified, subagent claim rejected | Pass |
| 5 Spend | Pass on headroom (USD 3), pause, settling from provider record, no Y spend without an amount — but missed that the USD 6 call exceeded the USD 5 approval line | Pass, and caught the threshold breach |
| 5 re-run after fix | Pass, now reports the threshold breach | — |
| 6 Gates | Pass — kept the signing boundary, routed within authority, asked with options about testers and deletion | Pass |
| 7 Newer direction | Pass — campaign-scoped amendment recorded verbatim, default untouched, reviewed change between builds, no filler PRs | Pass |
| 8 Routing | Pass — did not invoke the skill for a typo | not run |

Limits, stated plainly: the evaluators ran on this machine and inherited its global and Morpheus
instructions, which already encode much of the same guidance, so baselines passing here says the
skill does not degrade behaviour more than that it improves it; a project without Morpheus's
records was not simulated. The one observed difference — the approval-threshold check — became the
narrow correction in `references/mandate.md` and was confirmed by a re-run. Grading was by the
author, not an independent grader. Evaluator wording was not used to tune prose beyond that fix.

## Not done here

- Existing consumers (Evo, Lakina and others) do not yet carry the pointer. Each adopts it by
  re-running `morpheus init` (only missing files are written) or copying the pointer, in that
  repository's own reviewed PR, after this merges and the CLI updates. Not attempted from this task.
- No `agents/openai.yaml` interface metadata; the existing repository skills have none, and
  automatic invocation stays the default.
- No push beyond the claim, no PR and no CI yet: the coordinator holds the CI reservation.
