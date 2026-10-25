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
