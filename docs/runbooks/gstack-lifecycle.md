# gstack lifecycle pilot

Read when an operator opts a Morpheus session into gstack or when replaying the pilot.

Open the session with “Use gstack where relevant for this session.” At the first applicable
handoff, the agent calls the lifecycle adapter with `--gstack` and the active host. Morpheus
fetches the pinned upstream release, verifies its commit, and runs gstack's installer in a
private profile. The same release and host reuse the cached installation. Ordinary sessions
omit `--gstack` and skip setup and discovery. An install failure reports the reason and leaves
the task on its normal Morpheus path.

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
observers. Use `--skills-dir` to inspect an explicitly supplied host skills directory during a replay.
This override skips managed setup. Discovery reads named entrypoints. For Claude it uses
top-level entries marked by gstack's installer, so a disabled skill's nested payload does
not appear as installed. Manually copied and legacy Claude entries without the installer
marker are outside the pilot.

| Handoff | gstack playbook | Scope |
| --- | --- | --- |
| Plan | `autoplan` | Review the task plan when the scope warrants it. Give gstack the claimed task brief and acceptance. |
| Review | `review`, plus `qa-only` for web or CLI | Load the applicable playbooks, with a runnable authorized target for QA. Include the evidence in the independent review packet. |
| Verify | `verify` | Keep the project's focused build and test commands authoritative. Inspect gstack's proposed commands before running them, especially for iOS. |
| Monitor web | `canary` | Observe an exact release for an agreed interval. Return evidence to the existing owner. |

When the user opts in, acknowledge it once in visible chat and say that you will mark gstack
use as it happens. At each applicable handoff in that session, give a short visible update:

- Before running a skill, name it, the lifecycle step, and what you are using it for.
  Example: “gstack · Using qa-only at web review to reproduce the navigation issue.”
- If you check a handoff and skip gstack, state the reason and continue with Morpheus.
  Example: “gstack · Skipped at monitoring because there is no web release to observe.”
- After the skill finishes or stops, say what it produced or what prevented it from running,
  and what Morpheus does next. Include the skill name and evidence in the existing worklog
  or review packet when the task has one.

The lookup only offers candidates. Announce actual use when you begin following the skill.
Use a discovered workflow first when it fits and its prerequisites are met. If a playbook proposes work beyond the
mandate, stop that part and report the gap. The native gstack iOS device flow requires an
instrumented debug build and a paired device. An iOS route in this pilot uses engineering review
and the repository's existing simulator, build and test lanes.

In a managed run, read the returned skill by path in the current session. Apply the printed
environment in a subshell for each gstack shell step and resolve skill references starting
with `~/` against the managed home. In JSON mode, use `runtime.env` and prepend
`runtime.pathPrefix` to PATH. The agent checks the skill's task and target prerequisites
before execution.

Morpheus uses [gstack v1.97.0.0](https://github.com/garrytan/gstack/releases/tag/v1.97.0.0).
The release pin advances with a tested Morpheus change. The managed profile has gstack's
update checks and telemetry off. To remove the install, finish any gstack work and delete
`~/.morpheus/tools/gstack` (or `gstack` under `MORPHEUS_TOOLS_DIR`). This removes the runtime,
profiles, and browser cache together. A later opt-in installs it again.
