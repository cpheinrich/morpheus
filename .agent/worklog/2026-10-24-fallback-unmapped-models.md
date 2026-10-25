---
agent: claude
date: 2026-10-24
roadmap: MO-26-10-24-18.48.39
outcome: review
---

# MO-26-10-24-18.48.39 — Fall back to opus for unmapped Codex models in codex-claude

## Trigger

While delegating a cpheinrich.com task (CPH-26-10-24-16.53.44) from Codex to Claude,
`claude_start` threw `No Claude model mapping for Codex model "gpt-6.1-sol". Add it to modelMap
or pass an explicit model.` The coordinator had to ask Chris to choose Opus or Sonnet. Chris
authorized an automatic fallback for this class (latest Opus or Fable); the coordinator chose
the family alias `opus`. Upstream issue: #479.

## What changed

- `plugins/codex-claude/src/config.mjs`: `modelFallback` (validated fixed model id or family
  alias, moving aliases refused, nullable, default `opus`). `modelSelection` precedence is
  explicit override → `modelMap` → `modelFallback`; it returns `source`, `codexModel` and, for a
  fallback, a `reason`. A disabled fallback refuses with a message naming the setting. An empty
  explicit model is now "Unsupported Claude model identifier" rather than a mapping error.
- `src/service.mjs`: `inspect` adds a `selection` preview (errors reported, not thrown), so a
  coordinator sees what a start would run. The run record already persisted `selection`, so
  status/wait now carry the provenance too.
- `scripts/bridge.mjs doctor`: notes a disabled fallback.
- README model section and `skills/delegate/SKILL.md` step 5: the fallback is automatic, do not
  ask; report `selection.source`/`reason`; explicit user models are never replaced.

## Decisions and dead ends

- One more `modelMap` entry for `gpt-6.1-sol` was rejected: the next Codex release breaks it
  again.
- No CLI-error retry. The default fallback is a family alias the installed CLI always
  resolves, and a configured or explicit id the CLI rejects is somebody's choice; retrying it
  would replace that choice and blur auth, rate-limit and transport failures. It stays a
  visible failed run, as before.
- No Fable default and no availability discovery call: Fable may not be available on every
  subscription, and probing would spend allowance.
- Older plugin copies reading a configuration that now contains `modelFallback` would reject
  the unknown key (strict schema). The installer replaces the copy, so this only matters when
  downgrading; noted rather than worked around.

## Verification

- `node --test tests/*.test.mjs` in `plugins/codex-claude`: 52 pass on Node 26 and on Node 22.23
  (CI's major); `node scripts/check.mjs` exits 0 on both.
- New tests: `gpt-6.1-sol` and arbitrary new models select `opus` with provenance; mapped and
  explicit models unchanged; configured `fable` fallback; disabled fallback message; moving or
  malformed fallback rejected by the schema; a raw pre-existing `config.json` without the key
  loads with `opus` and round-trips `null`; inspect preview and launch argv carry `--model opus`
  with no provenance leaking into CLI arguments.
- Skill frontmatter: `quick_validate.py skills/delegate` → "Skill is valid!" (PyYAML from a
  throwaway venv).
- Focused only, per AGENTS: the change is plugin-only; CI runs the full Morpheus suite.
- Graph tools: not used; the change is confined to four plugin source files read directly.

## Independent review

A fresh Claude Code reviewer subagent (a18bded4e8f0e8f8f) reviewed eca4b42..2e11131 at normal risk and cleared it with minor findings only. It confirmed the precedence (override, modelMap, modelFallback), the schema and runtime refusal of moving aliases, backward-compatible loading of saved settings, that provenance never reaches the CLI arguments, and that no retry or paid path was added. The author fixed MIN-SKILL (the delegate skill's retry sentence contradicted 'never replaced by the fallback') in 7d51034, accepted MIN-TEST as a known gap because Manager.start cannot run without the real Claude CLI authentication check, and filed MO-26-10-24-18.56.45 for two pre-existing incidental lookup gaps (bracketed moving aliases, prototype-key model names). No second turn was needed. Limitation: the start-to-run-record path is covered by unit tests of its two seams, not an end-to-end start.

```morpheus-review
{
  "version": 2,
  "base": "eca4b42291ef19ea7127fe1ff8d2b5fa76d2e47e",
  "reviewed": "2e11131a51b253751735703e2d35bf915678a050",
  "covered": "7d51034efc6826107d05499af1297d5435c44b03",
  "authorSession": "1a14fe7d-6407-4f47-8ade-b5a1d1f808bd",
  "reviewerSession": "claude-code-subagent/a18bded4e8f0e8f8f",
  "risk": "normal",
  "elapsedMinutes": 2.6128833333333334,
  "timing": {
    "source": "runner",
    "durationMs": 156773,
    "evidence": "Claude Code Agent tool result for subagent a18bded4e8f0e8f8f: duration_ms=156773."
  },
  "outcome": "complete",
  "summary": "A fresh Claude Code reviewer subagent (a18bded4e8f0e8f8f) reviewed eca4b42..2e11131 at normal risk and cleared it with minor findings only. It confirmed the precedence (override, modelMap, modelFallback), the schema and runtime refusal of moving aliases, backward-compatible loading of saved settings, that provenance never reaches the CLI arguments, and that no retry or paid path was added. The author fixed MIN-SKILL (the delegate skill's retry sentence contradicted 'never replaced by the fallback') in 7d51034, accepted MIN-TEST as a known gap because Manager.start cannot run without the real Claude CLI authentication check, and filed MO-26-10-24-18.56.45 for two pre-existing incidental lookup gaps (bracketed moving aliases, prototype-key model names). No second turn was needed. Limitation: the start-to-run-record path is covered by unit tests of its two seams, not an end-to-end start.",
  "findings": [
    {
      "id": "MIN-SKILL",
      "severity": "minor",
      "description": "skills/delegate/SKILL.md step 5 said an explicit model is never replaced by the fallback, then told the agent to 'use the model the user authorized as the fallback' after an unrecognized-model error, which now reads as modelFallback.",
      "paths": [
        "plugins/codex-claude/skills/delegate/SKILL.md"
      ],
      "disposition": "fixed",
      "response": "Reworded: retry only with an alternative the user named for that case; a rejected modelFallback run (selection.source fallback) or a disabled/refused fallback is reported, not retried. Plugin tests 52 pass, check exit 0, skill validator valid."
    },
    {
      "id": "MIN-TEST",
      "severity": "minor",
      "description": "No test drives Manager.start with an unmapped model to assert the stored run selection records source fallback; tests cover previewSelection and claudeArgs.",
      "paths": [
        "plugins/codex-claude/tests/manager.test.mjs"
      ],
      "disposition": "disputed",
      "response": "Accepted as a known gap, as the reviewer allowed when no start harness exists: Manager.start calls checkClaude, which runs the real Claude CLI authentication check, and the existing manager tests construct runs directly rather than through start. start passes the same modelSelection result into the persisted record and claudeArgs; both seams are tested."
    },
    {
      "id": "INC-ALIAS",
      "severity": "incidental",
      "description": "The moving-alias refusal compares the whole string, so best[1m] or default[1m] passes for overrides, modelMap values and modelFallback; pre-existing.",
      "paths": [
        "plugins/codex-claude/src/config.mjs"
      ],
      "disposition": "deferred",
      "roadmap": "MO-26-10-24-18.56.45",
      "response": "Pre-existing; this PR adds one more path with the same comparison. Tracked with a fix plan (strip the bracket suffix before the check) in MO-26-10-24-18.56.45."
    },
    {
      "id": "INC-PROTO",
      "severity": "incidental",
      "description": "modelMap lookup is not limited to own keys, so a Codex model named toString, constructor or __proto__ fails as an unsupported identifier instead of falling back; pre-existing.",
      "paths": [
        "plugins/codex-claude/src/config.mjs"
      ],
      "disposition": "deferred",
      "roadmap": "MO-26-10-24-18.56.45",
      "response": "Pre-existing and unreachable with real Codex model names; tracked in MO-26-10-24-18.56.45 (Object.hasOwn lookup with boundary tests)."
    },
    {
      "id": "INC-ROADMAP",
      "severity": "incidental",
      "description": "Unrelated MO-26-10-24-10.03.55 moved to shipped with prs [477] on this branch.",
      "paths": [
        "hq/product/roadmap/MO-26-10-24-10.03.55-add-repair-only-control.md"
      ],
      "disposition": "disputed",
      "response": "No defect: pm claim reconciles merged work, and the reviewer confirmed PR 477 merged at 2026-10-24T18:52:21Z and recorded this as no action."
    }
  ]
}
```
