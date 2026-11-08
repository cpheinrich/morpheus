# gstack lifecycle pilot

Read when an operator opts a Morpheus session into gstack or when replaying the pilot.

Install a pinned gstack release for the intended host in an isolated workspace or profile using
[gstack's host setup](https://github.com/garrytan/gstack/blob/d479c5bf1efed979297dc4498c60aef7b67aa639/README.md#other-ai-agents).
The pilot was developed against gstack commit `d479c5bf1efed979297dc4498c60aef7b67aa639`.
Use the existing task workflow and open with “Use gstack where relevant for this session.”
The adapter only enables routing for invocations with `--gstack`. The session agent carries that
choice across the task. Omitting the flag skips discovery and returns no routes.

From the project root. In the pilot worktree, replace `morpheus` with `pnpm morpheus` to use
the branch's CLI:

```sh
morpheus skills lifecycle plan general --gstack --host codex
morpheus skills lifecycle review web --gstack --host codex --json
morpheus skills lifecycle verify ios --gstack --host claude
morpheus skills lifecycle monitor web --gstack --host codex
```

The surfaces are `general`, `web`, `ios`, and `cli`. Use `review` for author-side review
before the independent reviewer starts. Use `monitor web` for bounded observation of a specific
authorized web release. CI runs and TestFlight delivery stay with their existing Morpheus
observers. Use `--skills-dir` to inspect one isolated host skills directory during a replay.
Discovery reads named entrypoints from the project and host skills directories. For Claude it
uses top-level entries marked by gstack's installer, so a disabled skill's nested payload does
not appear as installed. Manually copied and legacy Claude entries without the installer marker
are outside this pilot. Discovery does not prove that all referenced helpers, browser/device
prerequisites or host permissions are available.

| Handoff | gstack playbook | Scope |
| --- | --- | --- |
| Plan | `autoplan` | Review the task plan when the scope warrants it. Give gstack the claimed task brief and acceptance. |
| Review | `review`, plus `qa-only` for web or CLI | Load the applicable playbooks, with a runnable authorized target for QA. Include the evidence in the independent review packet. |
| Verify | `verify` | Keep the project's focused build and test commands authoritative. Inspect gstack's proposed commands before running them, especially for iOS. |
| Monitor web | `canary` | Observe an exact release for an agreed interval. Return evidence to the existing owner. |

Use a discovered gstack workflow first when it fits and its prerequisites are met. Keep the
Morpheus workflow for absent or inapplicable skills. Report the skill name and the artifact or
command result in the existing worklog or review packet. If a playbook proposes work beyond the
mandate, stop that part and report the gap. The native gstack iOS device flow requires an
instrumented debug build and a paired device. An iOS route in this pilot uses engineering review
and the repository's existing simulator, build and test lanes.

The adapter never installs skills, starts agents, runs scheduled probes, or advances task state.
For Codex, use the reported `gstack-*/SKILL.md` path to identify the skill in the current session.
The declared skill name can be shorter than its install directory. For Claude Code, use the
discovered slash command. A matching file is discovery evidence only; the agent checks the skill
and its tool prerequisites before starting.
