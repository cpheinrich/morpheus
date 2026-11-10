---
agent: claude
date: 2026-11-10
roadmap: MO-26-11-10-01.03.46
outcome: review
tags: [engineering, agent-instructions]
---

# Leave touched code better without changing what it does

## The ask

Chris shared Anthropic's Fable 5.2 "Say who owns the code" note and asked for an ownership
directive in Morpheus and Evo that applies to Claude and Codex alike. He rejected the suggested
sentence as too permissive ("what it's for and how it's built are your call"). He also does not
want feature changes unless a feature is clearly broken and the fix is an unambiguous win.

## What the research found

- Anthropic's guide (verified on platform.claude.com): without an ownership statement, Fable 5.2
  merged repeated code in under a tenth of tries, and in about half with the sentence. The
  sentence also cost about 1.5 times the output tokens. It changed existing feature behaviour in
  one try in six to ten, and the model's summaries left out small changes.
- Codex's built-in prompt (`openai/codex` `codex-rs/models-manager/prompt.md`) says the opposite
  on purpose: "Do not attempt to fix unrelated bugs or broken tests … Changes should be minimal
  and focused on the task." So Codex needs the project rule to move at all.
- No independent replication of the ownership sentence was found. The nearest common practice is
  the "boy scout rule" in agent instruction files.

## What was built

One paragraph after **Simplicity first**, word for word in `AGENTS.md` and the scaffold template,
with a test that holds the two equal. It has no `doctor` anchor yet, because Chris is trying it in
Evo first.

Both files were at their size budgets: 144 bytes free under 20 KB here, and 7 bytes under 16 KB in
the scaffold. The new rule is about 470 bytes. To fit it, I shortened repeated or informational
sentences and removed no rule. Three sentences that `tests/init.test.ts` pins were restored after
a first attempt removed them.

## Test plan record

- `pnpm exec vitest run tests/agent-instructions.test.ts tests/doctor-instructions.test.ts tests/init.test.ts`:
  99 passed. Scope: the template, both size budgets and the doctor anchors are covered there.
- `pnpm typecheck`: clean.
