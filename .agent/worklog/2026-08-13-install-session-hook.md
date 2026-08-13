---
agent: claude
date: 2026-08-13
roadmap: MO-26-08-13-11.59.20
outcome: completed
---

# The session-start hook reaches every project

## What prompted it

"Does the context refresh run automatically for every new session?" It did not. The automatic part
is a `SessionStart` hook running `morpheus context brief`, and it existed in **two of eight**
registered projects — Morpheus and Evo. A second gap sat beside it: **seven of eight** never
declared `context.handle`, so `hq/team/<handle>.md` was not in the required set and a session there
certified `fresh` without ever opening the file Chris replies in.

`doctor` had been reporting both, per project, the whole time. The gap was never detection — it was
that nothing could act on the report.

## The root cause is one sentence

**`morpheus init` skips any file already present, so a scaffold only ever reaches new projects.**
That is correct for a scaffold and it means a file added to the template after a repo was created
never arrives. Both gaps are the same shape, and so is every future addition to `init`.

## What changed

- `src/session/install.ts` — `installContext`, merging rather than overwriting, refusing any file
  it cannot parse rather than replacing it. Three targets: `.claude/settings.json`,
  `.codex/hooks.json`, and `context.handle` in `morpheus.json`.
- `morpheus context install [--check] [--handle <h>]` — the repair path. Not gated, deliberately:
  it is the command that makes a project able to be fresh, so refusing it without a receipt would
  lock out the repair for the state it diagnoses.
- `init` now merges these three rather than `put`ting the settings file, so re-running it on an
  established repo works.
- `doctor` checks both providers' hook files and names `morpheus context install`.

## Codex has hooks — I concluded the opposite first, and was wrong

`codex --help` shows no `hooks` subcommand, and I reported to Chris that Codex 0.145 has no
session-start hook mechanism. He asked for Codex support anyway, which is the only reason I looked
again. It does have them, and the detail was two lines further down the same `--help` output I had
already read: `--dangerously-bypass-hook-trust`. A flag for bypassing hook trust is not a flag a
program without hooks carries.

**Absence of a subcommand is not absence of a feature**, and I had generalised from one listing to a
capability claim. The cost was a wrong answer in a decision prompt that Chris then had to override.

What is actually true, verified by probing rather than reading:

- Project scope is `.codex/hooks.json`; user scope is `~/.codex/hooks.json`. The schema is Claude
  Code's, event names and all — real plugin hook files on disk confirmed the shape before any doc
  did.
- `[features] codex_hooks` is **deprecated**; the flag is `[features] hooks`, and hooks are **on by
  default**, so no machine config is needed. Codex printed the deprecation itself when I set the
  old name — the tool answered a question the docs had not.
- **Trust is the gate.** A non-managed command hook is skipped until reviewed and trusted via
  `/hooks`, keyed on the hook's hash. Three `codex exec` probes fired nothing and reported nothing;
  trust, not configuration, was why.

That last one is the operationally important fact and it is invisible: an untrusted hooks file
exists, parses, and does nothing, which looks exactly like one that works. It is `learned.md`'s
"a check that skips what is absent reports the empty thing as correct", one layer out in the
toolchain — so `context install` prints the trust step whenever it writes the file, and AGENTS.md
carries it.

## Dead end

Hand-writing the trust hash into `config.toml` would have made the probes pass and was the obvious
shortcut. It is also exactly the control being tested: a human approving code that runs
automatically on every session. That is the repo's own boundary — obstacles are mine to clear,
gates are not — so the trust step stays a step, and the tool names it rather than routing around it.

## Verification

- 826 tests pass; 15 new across `tests/session-install.test.ts`, `tests/doctor.test.ts`,
  `tests/init.test.ts`.
- Nothing had asserted the scaffold writes a hook at all, which is how it drifted unnoticed. The
  doctor test now walks absent → present-but-inert → wired, because a file that exists and wires
  nothing was the failure mode the read was added for.
- Dogfooded: deleted Morpheus's own `.codex/hooks.json` and had the built CLI write it back;
  `--check` exits 0 on a wired repo.
