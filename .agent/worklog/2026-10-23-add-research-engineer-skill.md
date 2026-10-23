---
date: 2026-10-23
roadmap: MO-26-10-23-00.08.15
agent: claude
---

# A research-engineer skill under the agentic CTO

## Why

On 2026-10-23 Chris asked for a "Research Engineer" persona and skill, to be the first
individual-contributor skill under the agentic-CTO skill (MO-26-10-21-19.17.32). Agents doing ML
and algorithm work kept needing the same direction from him — a time-boxed literature review, a
benchmark before any claim, rounds of experiments on a cheap dev set — and he wants it built in
rather than repeated. This Claude session did the repository work, delegated by the Evo session
that wrote the skill text; it ran unsupervised and left the independent review and merge to that
author session.

## Sources

The skill text arrived written. It was distilled in the delegating session from a mining report
of 152 cited items: Chris's direction and agents' lessons across Evo's calorie-estimation,
segmentation, volume, model-evaluation and restaurant-matching work, plus Codex sessions and a few
Lakina and Morpheus ones. Evo and Lakina are private, so `references/provenance.md` already cites
them by date or path and paraphrases; nothing more from those sources entered this repository.
The three files were copied byte for byte (`cmp` clean). No mechanical fix was needed: the
description has no `: ` and parses with gray-matter, and the Codex skill validator accepts it.

## Design

- **Held exactly as `agentic-cto` is.** Canonical files in `.agents/skills/research-engineer/`
  with a byte-identical `.claude/skills/` mirror; `src/cto/skill.ts` carries both skills;
  `morpheus init` writes a one-file pointer for both providers in every project kind, with the
  description borrowed from the canonical file so both route the same requests. The skill's
  `../agentic-cto/SKILL.md` link resolves in both provider directories here, and in a scaffolded
  project it lands on the CTO pointer.
- **A topic of `morpheus cto guide`, not a new command.** `research-engineer` prints the
  entrypoint and its routes; `research-engineer/<reference>` prints a reference. It works under
  the CTO's mandate, budget and gates, so it belongs in that command's family. The slash keeps a
  skill's reference names from shadowing the CTO's — `research-engineer/provenance` and
  `provenance` are different files — so `cto guide`, `mandate` and `provenance` print exactly what
  they did apart from the one added CTO rule and its provenance row. Considered: a top-level
  `morpheus research guide` (a second surface for one family), and a two-word
  `cto guide research-engineer record` (it would have changed how extra arguments to the existing
  topics behave). The unknown-topic message now lists the new topics.
- **One generator.** `scripts/sync-agentic-cto-skill.mjs` now syncs a list of skills into their
  mirrors and one module, instead of a sibling script and a second generated file. Its name is
  kept so existing references stay true.
- **The CTO names it** in section 3 beside "Parallelize", with a class-D provenance row for
  Chris's 2026-10-23 request.
- **The pointer** restates two boundaries that hold before the guide is read (no benchmark, no
  claim; providers see only approved data, spend only within the mandate or a recorded standing
  allowance) and names `self update` for a CLI that predates the topic.
- No dependency: gray-matter, Node built-ins and the existing CLI, template and init seams.

## Dead ends and corrections

- The first `guide.ts` kept the individual-contributor skills in an object literal; a topic of
  `constructor` would have resolved through the prototype and printed a broken page. It became a
  `Map` before the first commit, and a test and mutant M7 hold it.
- Inserting the `research-engineer` bullet into `architecture.md` §7.1 moved the line the CTO
  provenance cites as "An idle agent is a design failure" from 567-568 to 573-574 — the same drift
  the CTO's own review caught (CTO-R3). The citation was updated and re-read at its new line. The
  `decisions.md` entry was appended at the end of the file so none of the CTO provenance's
  `decisions.md` citations move.
- A smoke test wrote one throwaway file to `/tmp` instead of the session scratchpad; it was
  removed at once.
- `pm claim` derived the branch name from the title (`…-agents-do-ml-algorithm`), not the
  `--slug`; that is the command's behaviour, and the item file carries the slug.

## Verification

- `pnpm typecheck` and `pnpm lint` clean. `pnpm compile` changed only `dist/cli/help.*`,
  `dist/cto/{guide,skill}.*` and `dist/init/{index,templates}.*`.
- Focused: `pnpm exec vitest run tests/agentic-cto-skill.test.ts tests/cli-dispatch.test.ts
  tests/init.test.ts tests/qa-preview.test.ts tests/agent-instructions.test.ts` — 5 files, 266
  tests passed (the skill file has 31, up from 12). Scope: the skill module and the suites
  covering CLI dispatch, init, the sibling pointer skill and `AGENTS.md`.
- Full `pnpm test` once, because `src/init/templates.ts` is shared core: 96 files, 2,654 tests
  passed.
- Installed shape: against the primary checkout's `main` `dist/`, `node dist/cli/index.js cto
  guide` differs only by the three-line rule, `mandate` is identical, and `provenance` differs
  only by the new row and the moved citation. `cto guide research-engineer/record` and
  `/provenance` output is byte-identical to the files.
- Codex skill-creator `quick_validate.py` (PyYAML in an ephemeral `uv` environment): `Skill is
  valid!` for the canonical skill, its mirror, the CTO skill and a rendered pointer.
- Mutation checks, each restored from Git afterwards — all twelve killed: init omits the Claude
  pointer (4 failures); pointer borrows the CTO's description (1); Claude mirror drifts (1); the
  cross-skill link broken in every copy (2); the CTO no longer names the skill (1); routes drop
  the skill prefix (1); topic lookup through an object literal (1); an unprefixed reference
  accepted (1); pointer names a missing topic (1); an unknown skill borrows the CTO's description
  (1); pointer written only in company projects (2); an orphan reference (1).

## Not done here

- No forward evaluation with fresh agents, unlike the CTO skill: the text was written and owned
  by the delegating session, and this task was its distribution.
- Existing consumers (Evo, Lakina and others) do not carry the pointer yet. Each adopts it by
  re-running `morpheus init` after this merges and the CLI updates, in its own reviewed PR.
- Independent review, the review record and merge are the author session's.
