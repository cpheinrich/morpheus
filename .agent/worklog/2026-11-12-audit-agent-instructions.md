---
agent: claude
date: 2026-11-12
roadmap: MO-26-11-12-23.23.28
outcome: review
tags: [engineering, agent-instructions]
summary: "Audited the instruction stack against current Claude Code and Codex guidance: trimmed duplicates from AGENTS.md, made the scaffold's upstream reading conditional, corrected the spec's loader facts and added a doctor warning at Codex's 32 KiB cut."
---

# Audit the agent-instruction stack against current loader guidance

Chris asked for an audit of the instruction stack in Morpheus, Evo and Lakina against the current
Claude Code and Codex guidance, with one proposal PR per repository. This is the Morpheus one. It
is a proposal for Chris to review, so the PR stays a draft.

## What I found

- **Codex silently cuts project instructions at 32,768 bytes**, counted over every `AGENTS.md`
  from the Git root to the launch directory. Morpheus's file (19,998 bytes) fits. Two consumer
  projects' files do not, and nothing told anyone: Morpheus's own file and the scaffold are held
  by size tests, consumer files by nothing.
- **Claude Code has no such cap.** It loads the whole file and advises under 200 lines.
- **The `CLAUDE.md` symlink is still the right loader.** Claude reads `AGENTS.md` directly only
  when no `CLAUDE.md` exists in the launch directory or above it.
- **The scaffold told every agent to read upstream `architecture.md` (293,735 bytes) "before
  reviewing or changing anything".** Both vendors now name that pattern as one to remove. Evo and
  Lakina had each already softened it by hand, so the template was behind its own consumers.
- **The scaffold's "Found a gap in Morpheus itself?" subsection sat under the wrong heading.** The
  context-tools block, an `##` heading, was inserted above it.
- **Spec §7.1 described an upgrade command that rewrites a marked region.** It was never built;
  `doctor` naming missing rules is what exists.
- **Morpheus's own file repeated itself in a few places** and sat 2 bytes under its 20,000-byte
  test, so the next rule would have forced a cut under time pressure.

## What changed

- `AGENTS.md`: 19,998 to 18,860 bytes, 302 to 286 lines. No rule removed (appendix A lists every
  edit).
- `src/init/templates.ts`: the callout says when to open the upstream documents; the upstream-gap
  subsection is back under its heading and shorter. Scaffold 15,998 to 15,446 bytes.
- `architecture.md` §7.1: what each loader does, why the symlink stays, what a nested file can
  carry.
- `src/doctor/`: a warning when `AGENTS.md` exceeds 32,768 bytes, naming the line of the cut.
- `.agent/learned.md` and `.agent/decisions.md`: the loader facts and the proposed decision.

## Considered and not done

- **Remove the `CLAUDE.md` symlink and let Claude read `AGENTS.md` directly.** Rejected: it
  breaks older clients and any checkout under a directory that has its own `CLAUDE.md`.
- **Split conditional detail into `.claude/rules/` with `paths:`.** Rejected: Codex does not read
  them, so each rule would need a second home.
- **Move surface rules into nested `AGENTS.md` files.** Rejected for rules: Codex loads a nested
  file only when launched inside its directory.
- **A size check for Claude's 200 lines.** Not added: it is advice, and Morpheus's own file is 286.
- **Raise `project_doc_max_bytes` in each project's `.codex/config.toml`.** Not proposed: it
  hides growth instead of removing it, and a project file is only read in a trusted project.

## Dead ends

- `morpheus codebase-memory install --check` reported no index for this checkout and automatic
  indexing off. `morpheus codebase-memory install` then refused: "active CBM sessions and
  operations could not be stopped safely; no activation was committed". Other sessions on the
  device hold it, so I did not force it. The graph MCP also failed to connect in this session. No
  graph result was used; the two changed functions were read directly.
- A first cut of the upstream-gap text dropped "needs a fork" and "without secrets".
  `tests/init.test.ts` pins both on purpose, so the shorter text keeps them.

## Test plan

- `pnpm typecheck`: clean.
- `pnpm exec vitest run tests/agent-instructions.test.ts tests/doctor-instructions.test.ts tests/init.test.ts tests/doctor.test.ts`:
  133 passed. Scope: the files that read `AGENTS.md`, the template and `doctor`.
- `pnpm test` once, because `src/init/templates.ts` is shared core: 153 files, 4,352 tests passed.
- `pnpm compile` and `pnpm morpheus pm index`: generated changes committed.
- `morpheus complexity check`: passes, 18 functions checked, CCN limit 15.

## Open questions

- Should `doctor` also warn at a lower "getting close" size, for example 28 KB? I left one
  threshold, the real one.
- The 20 KB and 16 KB test budgets are unchanged. With Codex's chain budget at 32 KiB they leave
  12 to 16 KB for a nested file. Is that the split Chris wants?

## Appendix A — every edit to `AGENTS.md`

| Edit | Why | Rule kept where |
|---|---|---|
| Layout: removed 10 rows (`src/pm/`, `src/cli/`, `src/gh-manager/`, `hq/product/`, `docs/runbooks/`, `tests/`, `.agent/worklog/`, `.agent/decisions.md`, `.agent/inbox-archive/`, `hq/team/<handle>.md`) | Derivable from the tree, or restated by a later section | Context freshness, worklog rule, inbox cycle, GitHub Manager section, runbook index |
| Layout: `.github/workflows/` now says a merge ships to every project | The row's only non-obvious fact | Same row |
| Removed "**read this first**" from the `decisions.md` row | Line 3 says the same of `AGENTS.md`; Context freshness lists the real reading order | Context freshness |
| Other rules: removed the Websites and Folder READMEs bullets | Each repeated its runbook-index row | Runbook index rows now carry "run `morpheus web init` before writing any of it by hand" and "a README only where an agent could otherwise do the wrong thing" |
| The gstack sentence became a runbook-index row | It is a "read when" pointer | Runbook index |
| "GitHub Manager is the backstop." removed from Follow your PR through merge | Its own section says it | The GitHub Manager section |
| Removed the "iOS projects:" paragraph | It governs other repositories, which carry the rule; Morpheus has no iOS suite | Scaffold template, held by `tests/agent-instructions.test.ts` |
| Review loop: one 19-line paragraph became a lead line and four labelled bullets | Both vendors advise bullets over dense paragraphs | Every sentence is unchanged; only the order groups them by phase |

## Appendix B — sources, read 2026-11-12

- Claude Code, [How Claude remembers your project](https://code.claude.com/docs/en/memory):
  load order, the 200-line target, the 4 MiB skip, `AGENTS.md` support from v2.1.277, the
  **Project instructions** modes, nested loading, path-scoped rules, imports, symlinks.
- Claude Code, [Best practices](https://code.claude.com/docs/en/best-practices): keep the file to
  what the code does not show; rules without exceptions belong in hooks.
- Claude Code, [Monorepos and large codebases](https://code.claude.com/docs/en/large-codebases)
  and [subagents](https://code.claude.com/docs/en/sub-agents): per-directory files against
  path-scoped rules; what a subagent loads.
- Claude Code [changelog](https://code.claude.com/docs/en/changelog): `AGENTS.md` support added
  in 2.1.277, extended to gateways and telemetry-off sessions in 2.1.281.
- Codex, [Custom instructions with AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md):
  root-to-launch-directory discovery, overrides, the 32 KiB default.
- Codex, [Advanced Config](https://learn.chatgpt.com/docs/config-file/config-advanced),
  [Customization](https://learn.chatgpt.com/docs/customization/overview) and
  [GitHub review rules](https://learn.chatgpt.com/docs/third-party/github): "Keep it small",
  routing guidance, nested review rules.
- OpenAI, [Rethinking skills and prompts for GPT-6 Astra](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra):
  remove read-everything-first and over-strong boundary wording.
- Codex source, [`agents_md.rs`](https://github.com/openai/codex/blob/main/codex-rs/core/src/agents_md.rs)
  at `main` (commit `49f2fc2c`, 2026-11-04) and tag `rust-v0.168.0`: the truncation itself.

## Independent review

Not run. The delegating session instructed this worker not to launch another agent, and no other
fresh session was available to it. The PR is an unlabelled draft with auto-merge off.
