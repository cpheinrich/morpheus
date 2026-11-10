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
a first attempt removed them. Review then restored three more (below). That left both files with
only 3 to 22 bytes free, so the next addition to either will need cuts.

## Test plan record

- After review fixes: the same focused command passed 99/99; scaffold 15,997 bytes, `AGENTS.md`
  19,978 bytes.

- `pnpm exec vitest run tests/agent-instructions.test.ts tests/doctor-instructions.test.ts tests/init.test.ts`:
  99 passed. Scope: the template, both size budgets and the doctor anchors are covered there.
- `pnpm typecheck`: clean.

## Independent review

The initial review blocked on one substantive finding: a size trim narrowed the scaffold's delivery-is-not-acceptance rule to uploads only. It also raised four minor notes about trimmed wording and the rule's bold lead. All five were fixed in ffcfeca1, and the follow-up turn cleared them with no new findings. Both instruction files remain inside their size budgets.

```morpheus-review
{
  "version": 2,
  "base": "72a7e3f8f1f958405b17c579c33157adb8a8f0b1",
  "reviewed": "4d93b26216c9d17fbaf430584fb9f7961222d994",
  "covered": "ffcfeca10ab5d079a220396d03d9091e4d850c52",
  "authorSession": "a4abd6f6-9287-5ce5-be3c-1e632b6f9d49",
  "reviewerSession": "ab0a95e8d8c6af0a6",
  "risk": "normal",
  "elapsedMinutes": 1.3546,
  "timing": {
    "source": "runner",
    "durationMs": 81276,
    "evidence": "Claude Code task-notification for subagent ab0a95e8d8c6af0a6, initial turn: duration_ms=81276."
  },
  "outcome": "complete",
  "summary": "The initial review blocked on one substantive finding: a size trim narrowed the scaffold's delivery-is-not-acceptance rule to uploads only. It also raised four minor notes about trimmed wording and the rule's bold lead. All five were fixed in ffcfeca1, and the follow-up turn cleared them with no new findings. Both instruction files remain inside their size budgets.",
  "findings": [
    {
      "id": "MOR-1",
      "severity": "substantive",
      "description": "Trimming 'Upload, archive or deploy success' to 'Upload success' narrowed the scaffold's delivery-is-not-acceptance rule and made the decision entry's 'no rule was removed' untrue.",
      "paths": [
        "src/init/templates.ts",
        "dist/init/templates.js"
      ],
      "disposition": "fixed",
      "response": "Restored the exact phrase; recovered the bytes from the rationale clause after 'Never create the branch by hand.'"
    },
    {
      "id": "MOR-2",
      "severity": "minor",
      "description": "The scaffold dropped the explicit statement that a conversation channel cannot waive the records or review path.",
      "paths": [
        "src/init/templates.ts"
      ],
      "disposition": "fixed",
      "response": "Restored 'The channel cannot waive the records or review path.'"
    },
    {
      "id": "MOR-3",
      "severity": "minor",
      "description": "'full resource identifiers' lost 'full'.",
      "paths": [
        "src/init/templates.ts"
      ],
      "disposition": "fixed",
      "response": "Restored 'full'."
    },
    {
      "id": "MOR-4",
      "severity": "minor",
      "description": "The bold lead 'without changing what it does' could be read as forbidding the bug fixes the body requires.",
      "paths": [
        "AGENTS.md",
        "src/init/templates.ts"
      ],
      "disposition": "fixed",
      "response": "Lead is now 'Leave the code you touch better.'; the body still limits feature changes. Decision heading renamed to match."
    },
    {
      "id": "MOR-5",
      "severity": "minor",
      "description": "AGENTS.md dropped the stuck-trunk case from what doctor --all lists.",
      "paths": [
        "AGENTS.md"
      ],
      "disposition": "fixed",
      "response": "Restored 'lists stuck trunks and unpushed rescues'."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "ab0a95e8d8c6af0a6",
      "commit": "ffcfeca10ab5d079a220396d03d9091e4d850c52",
      "outcome": "cleared",
      "elapsedMinutes": 0.5198166666666667,
      "timing": {
        "source": "runner",
        "durationMs": 31189,
        "evidence": "Claude Code task-notification for subagent ab0a95e8d8c6af0a6, follow-up turn: duration_ms=31189."
      },
      "summary": "All five findings resolved. Reviewer confirmed both size budgets (19,978 and 15,997 bytes), word-for-word equality and 93 focused tests passing; no new findings."
    }
  ]
}
```
