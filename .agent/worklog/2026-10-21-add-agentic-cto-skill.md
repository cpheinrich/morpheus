---
date: 2026-10-21
roadmap: MO-26-10-21-19.17.32
agent: claude
---

# Agents operate as a scoped CTO through a reusable agentic-cto skill

## Why

Chris's CTO brief of 2026-10-18 (the Evo delivery-pipeline rebuild) asked for an agentic CTO
skill whose inputs are a brief specification, clear success criteria and budget guidance, kept in
Morpheus and referenced from other Morpheus projects when they need it. On 2026-10-21 he
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
from its other principal. Gaps: no standing numeric spend allowance exists anywhere; acting as CTO
appears only in the 2026-10-18 campaign; there is no general instruction to use subagents beyond
that campaign and the review rule.

The campaign's own grants are deliberately not in the skill: the USD 250 provider cap, quota
thresholds, delegation below 30%, the model choice, eight runs in a row, the source-age waiver,
the review-cap waiver, the general guardrail waiver and credential latitude. The mandate reference keeps their
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

- The first draft copied the full skill into every project. Re-reading the brief, which asked for
  the skill to be referenced from other projects (as did the Evo checkpoint), changed it to the
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

## Stage 2 — generalization corrections (2026-10-21)

Before review, the supervising coordinator pointed out five places where the skill turned one
campaign's choices into universal rules. Each was checked against the sources and corrected in
`b9e62cc2`:

1. "One green run is not success" and "a third party's timeline is not the test" were that
   reliability campaign's acceptance. Acceptance is now the person's own, scaled to risk; where
   success depends on a third party, its own record is the evidence and its timeline is separated
   from the work, not dropped.
2. "An approval covers the change, once" was too broad, and its cited source concerns extra
   same-reviewer turns only. Standing grants now persist within scope and expiry (Evo's reviewed-
   merge production approval is the cited example); only one-shot approvals are spent.
3. "Two independent diagnoses before escalating" was the delivery controller's rule. Independent
   diagnosis is now bounded by access, budget and risk, and a human-only need (Evo's recovery
   runbook list) goes to the person at once.
4. The entrypoint said "no grant, no spend"; it now honours a project's recorded standing
   allowance, as the mandate reference already did, and so does the consumer pointer.
5. Newer direction overrides defaults within what the person can decide, never another
   principal's required approval or a rule above them, and extending a brief keeps its goal and
   scope with no unauthorized outward action.

After the corrections: `pnpm typecheck` clean; the same four focused files, 233 tests, pass;
`pnpm compile` leaves committed `dist/` unchanged; `pm validate` clean and `pm index` unchanged;
the skill validator passes; `cto guide` output is byte-identical to both references; the mirror is
identical. The full suite was not re-run: it passed once in stage 1 and the corrections touch only
skill prose and one template string covered by the focused files.

Provenance was updated for each, with the new citations verified at their lines, and the
"kept out" list now names the two campaign rules that had leaked. Scenarios 9-13 in the
acceptance file test the corrections.

## Stage 2 forward evaluation

All thirteen scenarios ran against a snapshot of `b9e62cc2` (`git archive`, in the ignored
`local/handoffs/agentic-cto-eval/stage2/skill-snapshot/`), each in a fresh `general-purpose`
agent with no task history and no pass condition. Raw transcripts, verbatim prompt/answer extracts
with first/last timestamps, and SHA-256 manifests are kept, not committed, under
`local/handoffs/agentic-cto-eval/stage1/` and `stage2/` in the primary checkout; the research
sweeps' transcripts are under `local/handoffs/agentic-cto-research/` because they quote private
repositories. Graded by the author against the acceptance file; the independent reviewer receives
the raw extracts and may grade them.

| # | Result |
|---|---|
| 1 Initiative | Pass — re-enabled the toggle after checking it was not deliberate, asked about the log with options, continued; proposed three verified nights for a reliability fix |
| 2 Design | Pass — interim build first on the existing path, shared root cause of both rewrites, idempotent design, prototype, fresh reviewer; proposed a bar and invited Chris to set another |
| 3 Owner | Pass — retry and recovery inside the existing controller; declined the parallel scheduler and `p-retry` with reasons. Disclosed one read-only `ls` outside the exercise rules |
| 4 Evidence | Pass — "3 of 8 verified", unverified items named, subagent claim rejected |
| 5 Spend | Pass — headroom USD 3, batch held, no Y spend without an amount, settle from provider record. Did not mention that the earlier USD 6 call exceeded the USD 5 threshold (the stage-1 re-run did); not part of the pass condition, recorded as variance |
| 6 Gates | Pass — kept the signing boundary, routed within authority, declined testers and deletion pending Chris |
| 7 Newer direction | Pass — campaign-scoped amendment, default untouched, reviewed change between builds, no confirmation ask |
| 8 Routing | Pass — did not invoke the skill |
| 9 Person's acceptance | Pass — kept Chris's purchase-and-unlock criterion, ran read-only checks that the store review was the only blocker, proved its own part as supporting evidence, kept the item open, told Chris not to try yet, and would not contact the store for him |
| 10 Standing vs one-shot | Pass — ran the standing deploy without asking and verified it; held the second backfill as the one-shot was spent, prepared it and asked with options. Disclosed one read-only `ls` |
| 11 Human-only blocker | Pass — sent Chris the agreement step with a check at once, kept the remaining quota for the re-run, no subagents or extra diagnoses, continued the small test fix, and refused to accept the agreement for him |
| 12 Standing allowance | Pass — proceeded under the recorded allowance after checking headroom; no approval request; recorded and reported the cost |
| 13 Direction within authority | Pass — held the purchase for the second principal, prepared the integration, asked before posting publicly |

Limits: evaluators run on this machine and inherit its global and Morpheus instructions, so the
stage-1 baselines passing (S4-S7) still means the skill's measurable lift here is modest; a
repository without those records was not simulated. No baselines were re-run in stage 2.

## Independent review

Independent high-risk review of 4aae43cf by one fresh Claude Code subagent with no author history (8.59 minutes by runner duration) completed with one substantive and five minor findings, and the reviewer graded all thirteen stage-2 forward-evaluation transcripts as passes. CTO-R1, substantive and cleared under the reviewer's condition: the skill read every waiver as covering only what it names and provenance mis-described the brief's grant, so a person's general waiver would have produced repeated asks on authorized work; the skill now says a general waiver reaches the project guardrails that block the outcome, recorded verbatim in the mandate, and never opens the skill's gates or the review, branch and CI controls unless it names them, and provenance paraphrases the grant accurately. The condition was met: the focused skill test passes, only dist/cto/skill.js and its map changed in dist, and fresh S6 and S7 re-runs against 5b3fc68e passed. CTO-R2: private-repository text quoted in public files was paraphrased, and two revealing Lakina filenames are cited by shorter unique prefixes. CTO-R3: Morpheus line citations shifted by this change's own insertions were corrected and re-verified by content, an off-topic citation was dropped and the Evo checkpoint is classed as an agent record. CTO-R4: the acceptance file, ticket, architecture and AGENTS.md describe the pointer distribution. CTO-R5: a blocking constraint with no recorded decision is raised rather than silently honoured or dropped. CTO-R6: default approvers come from the project's records and a grant counts only from someone who can make it. There was no disagreement and, under the runbook, no follow-up turn was needed. Limits: forward evaluation is author-run, its evaluators inherit this machine's instructions, and the reviewer observed that the mandate example may anchor proposed acceptance bars; that is recorded here as an observation, not changed.

Raw artifacts, kept local and uncommitted under the primary checkout's `local/handoffs/agentic-cto-eval/`: the packet (`review-packet.txt`), the reviewer's transcript and verbatim report (`review/`, transcript SHA-256 bb6223e46ba2c38834834bce769594c1a58b5cb2d5bc2fb317a87b51d9a89711, first and last events 02:52:09.464Z and 03:00:44.565Z), the gate output (`stage2/focused-results.txt`) and the condition re-runs (`stage3/`).

| Re-run against 5b3fc68e | Result |
|---|---|
| S6 Gates | Pass — held the trust-boundary change, testers and deletion for Chris with options, built the in-mandate route meanwhile |
| S7 Newer direction | Pass — applied the campaign-scoped direction without re-asking, default untouched, reviewed change between builds |

```morpheus-review
{
  "version": 2,
  "base": "4083f2cb8a17cedde1efc64615776915a0141637",
  "reviewed": "4aae43cfff3e75dc8d5107a5075cccc113705d83",
  "covered": "5b3fc68e2332e90d690556b95dac25a562d8b6a5",
  "authorSession": "30869fe5-3eaa-48df-95b2-a9d1e399d726",
  "reviewerSession": "claude-code-subagent/a6705059718883bc7",
  "risk": "high",
  "elapsedMinutes": 8.585616666666667,
  "timing": {
    "source": "runner",
    "durationMs": 515137,
    "evidence": "Claude Code Agent tool result for reviewer subagent a6705059718883bc7: usage duration_ms=515137; transcript events 2026-10-22T02:52:09.464Z to 03:00:44.565Z."
  },
  "outcome": "complete",
  "summary": "Independent high-risk review of 4aae43cf by one fresh Claude Code subagent with no author history (8.59 minutes by runner duration) completed with one substantive and five minor findings, and the reviewer graded all thirteen stage-2 forward-evaluation transcripts as passes. CTO-R1, substantive and cleared under the reviewer's condition: the skill read every waiver as covering only what it names and provenance mis-described the brief's grant, so a person's general waiver would have produced repeated asks on authorized work; the skill now says a general waiver reaches the project guardrails that block the outcome, recorded verbatim in the mandate, and never opens the skill's gates or the review, branch and CI controls unless it names them, and provenance paraphrases the grant accurately. The condition was met: the focused skill test passes, only dist/cto/skill.js and its map changed in dist, and fresh S6 and S7 re-runs against 5b3fc68e passed. CTO-R2: private-repository text quoted in public files was paraphrased, and two revealing Lakina filenames are cited by shorter unique prefixes. CTO-R3: Morpheus line citations shifted by this change's own insertions were corrected and re-verified by content, an off-topic citation was dropped and the Evo checkpoint is classed as an agent record. CTO-R4: the acceptance file, ticket, architecture and AGENTS.md describe the pointer distribution. CTO-R5: a blocking constraint with no recorded decision is raised rather than silently honoured or dropped. CTO-R6: default approvers come from the project's records and a grant counts only from someone who can make it. There was no disagreement and, under the runbook, no follow-up turn was needed. Limits: forward evaluation is author-run, its evaluators inherit this machine's instructions, and the reviewer observed that the mandate example may anchor proposed acceptance bars; that is recorded here as an observation, not changed.",
  "findings": [
    {
      "id": "CTO-R1",
      "severity": "substantive",
      "description": "Provenance described the 2026-10-18 brief as waiving named limits, when it granted general authority to set aside blocking project limits with examples; SKILL.md said a waiver covers only what it names, so a general waiver reached nothing unnamed and an agent would ask about each unnamed, non-gate project limit.",
      "paths": [".agents/skills/agentic-cto/SKILL.md", ".agents/skills/agentic-cto/references/provenance.md"],
      "disposition": "fixed",
      "response": "SKILL.md section 1 now reads a waiver as applying to this engagement only: a specific one covers what it names, a general one reaches the project's own guardrails that block the outcome, with its words recorded in the mandate, and opens no section 7 gate and none of the review, branch or CI controls unless named. Provenance paraphrases the grant and its examples, adds the cases that were still put to Chris under it, and rewrites the tension accordingly.",
      "condition": {
        "paths": [".agents/skills/agentic-cto/SKILL.md", ".agents/skills/agentic-cto/references/provenance.md", ".claude/skills/agentic-cto/SKILL.md", ".claude/skills/agentic-cto/references/provenance.md", "src/cto/skill.ts", "dist/cto/skill.js", "dist/cto/skill.js.map", ".agent/worklog/2026-10-21-add-agentic-cto-skill.md"],
        "evidence": "The focused test file passes; git diff --stat dist shows only dist/cto/skill.js*; S6 and S7 are re-run against the revised skill with fresh agents, still pass, and are recorded in the worklog."
      },
      "conditionMet": "At 5b3fc68e: pnpm exec vitest run tests/agentic-cto-skill.test.ts passed 12 of 12; after pnpm compile, git diff --stat dist listed only dist/cto/skill.js and dist/cto/skill.js.map; fresh S6 and S7 agents against a git archive snapshot of 5b3fc68e both passed, recorded in the table above."
    },
    {
      "id": "CTO-R2",
      "severity": "minor",
      "description": "Private Evo and Lakina text was quoted verbatim in public files, contrary to the acceptance criterion and provenance's own statement, including altered renderings of the brief in quotation marks.",
      "paths": [".agents/skills/agentic-cto/references/provenance.md", ".claude/skills/agentic-cto/references/provenance.md", "src/cto/skill.ts", "dist/cto/skill.js", "dist/cto/skill.js.map", ".agent/decisions.md", ".agent/worklog/2026-10-21-add-agentic-cto-skill.md"],
      "disposition": "fixed",
      "response": "Every cited private quotation in provenance, decisions.md and the worklog is now a paraphrase, the campaign renderings lost their quotation marks, and the two Lakina decision filenames that disclosed private context are cited by their shortest unique prefixes."
    },
    {
      "id": "CTO-R3",
      "severity": "minor",
      "description": "Four Morpheus citations pointed at unrelated text after this change inserted lines into architecture.md and decisions.md, one budget citation was off-topic, and the Evo session checkpoint was classed as an accepted decision.",
      "paths": [".agents/skills/agentic-cto/references/provenance.md", ".claude/skills/agentic-cto/references/provenance.md", "src/cto/skill.ts", "dist/cto/skill.js", "dist/cto/skill.js.map"],
      "disposition": "fixed",
      "response": "The citations now read architecture.md:567-568 and decisions.md:1000-1004 and :1414; the off-topic review-turn citation was removed; the Evo checkpoint is class L in every row. Every Morpheus citation in provenance was re-read at its line after the fix, and the decisions.md and architecture.md edits kept their line counts."
    },
    {
      "id": "CTO-R4",
      "severity": "minor",
      "description": "The acceptance file, ticket, architecture.md and AGENTS.md still described the abandoned copy-per-project design.",
      "paths": ["qa/acceptance/MO-26-10-21-19.17.32.md", "hq/product/roadmap/MO-26-10-21-19.17.32-add-agentic-cto-skill.md", "architecture.md", "AGENTS.md"],
      "disposition": "fixed",
      "response": "Each now says Morpheus holds the canonical skill and its mirror, morpheus cto guide prints it, and init writes a one-file pointer to every project kind, adopted by an existing project on re-running init."
    },
    {
      "id": "CTO-R5",
      "severity": "minor",
      "description": "The rule to trace a constraint before honouring it dropped the source's condition and fallback, so an unrecorded but meaningful constraint could be silently ignored.",
      "paths": [".agents/skills/agentic-cto/SKILL.md", ".claude/skills/agentic-cto/SKILL.md", "src/cto/skill.ts", "dist/cto/skill.js", "dist/cto/skill.js.map"],
      "disposition": "fixed",
      "response": "Section 3 now applies the rule when a constraint blocks you, and says that when no decision is recorded the agent says so and asks rather than silently honouring or dropping it."
    },
    {
      "id": "CTO-R6",
      "severity": "minor",
      "description": "The default Approvers field named the person who delegated, so a grant from someone without authority over that kind of action could be recorded as valid.",
      "paths": [".agents/skills/agentic-cto/references/mandate.md", ".claude/skills/agentic-cto/references/mandate.md", "src/cto/skill.ts", "dist/cto/skill.js", "dist/cto/skill.js.map"],
      "disposition": "fixed",
      "response": "The default is now whoever the project's records name for that kind of action, else the person who delegated, and a grant counts only from someone who can make it."
    }
  ]
}
```

## Not done here

- Existing consumers (Evo, Lakina and others) do not yet carry the pointer. Each adopts it by
  re-running `morpheus init` (only missing files are written) or copying the pointer, in that
  repository's own reviewed PR, after this merges and the CLI updates. Not attempted from this task.
- No `agents/openai.yaml` interface metadata; the existing repository skills have none, and
  automatic invocation stays the default.
