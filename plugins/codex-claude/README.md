# Codex Claude

Two-way subscription delegation between Codex and Claude Code on the same machine and
checkout. A persistent Codex task can coordinate Claude Code, and a Claude Code session can
coordinate Codex (see [Claude coordinating Codex](#claude-coordinating-codex)). This package is optional and **off
by default**. Cloning Morpheus, installing its CLI, and scaffolding projects do not install
or activate it.

## Where things live

- **Source, instructions, tests:** `plugins/codex-claude/` in Morpheus. Edit this package
  and submit a reviewed Morpheus PR to change its behavior.
- **Installed source copy:** `~/plugins/codex-claude/`, registered in your
  personal marketplace. Codex additionally maintains its own plugin cache. These are copies,
  not links to your working tree; installing an update is explicit.
- **Personal settings and bridge records:** `~/.local/share/codex-claude/` (0700 directory,
  0600 files). `CODEX_CLAUDE_HOME` relocates this for testing or a separate installation.
- **Claude conversations and memories:** Claude's native store, normally `~/.claude/`.
  The bridge records the session id per Codex task and worktree; it does not merge stores.
- Nothing about your subscription, selected executor, machine paths or conversation content
  belongs in the Morpheus repository.

## Install on each execution host

Prerequisites: macOS, Node 22+, Python 3, pnpm 11, both CLIs on PATH, Codex signed in and
Claude Code signed in with `claude auth login` using your subscription. Include
`~/.local/bin` and `/opt/homebrew/bin` in the host's environment when needed.

From this package directory, explicitly run:

```sh
node scripts/install.mjs
```

The installer copies the package, installs its locked dependencies, tests it, and uses
Codex's bundled plugin-creator helper to register it in the personal marketplace. It
preserves other marketplace entries. If that helper is elsewhere, set
`CODEX_PLUGIN_CREATOR` to its `create_basic_plugin.py` path. Installation does not choose
manual or automatic mode. Finish existing delegated runs before updating the package;
restart the bridge after an update so it loads the new source.

Start a new Codex task to load the installed skill/tools. Review and trust the plugin hooks
through `/hooks`; installing a plugin does not itself trust hooks. On each execution host,
start the local Codex service if needed:

```sh
codex app-server daemon start
node ~/plugins/codex-claude/scripts/bridge.mjs doctor
node ~/plugins/codex-claude/scripts/bridge.mjs enable automatic
```

Use `enable manual` for delegation only on request. `disable` is a master off switch and
stops active delegated runs, retaining conversations. Disabling/uninstalling the plugin
in Codex removes its tools/hooks; existing normal workers expire when their owner lease
stops. Explicit background workers must be stopped before uninstalling.

The mode is personal to this host, not to Morpheus projects or colleagues. A project's
mode can be set under `projects` using the canonical project key returned by `inspect`.
A project or task `off` takes precedence over executor overrides. Global `off` takes
precedence over everything. No daemon is started by an off-mode hook.

## Everyday use

Ask Codex naturally:

- “Use Claude for this task.”
- “Use Codex for this task.”
- “Return this task to automatic routing.”
- “Use Codex just to generate this image, then resume automatic routing.”
- “Stop Claude.”
- “Show Claude's live output.”

Automatic mode checks the least remaining fresh reported Codex allowance window. At
**less than 50% remaining** by default, Codex delegates at the next safe checkpoint.
At exactly 50%, Codex continues. The same threshold applies in the other direction. This is subscription allowance, not a token count for a
single chat. Codex still consumes allowance while supervising; this cannot keep Codex
coordinating once its account is exhausted. Missing/stale usage is reported as unknown.
The 50% default hands work over while half the coordinator's allowance remains, leaving
ample headroom for supervision and other active chats. Existing saved thresholds are
preserved when updating the plugin; change one with `bridge.mjs config`.
Routing hooks advise the coordinating agent; they do not replace the desktop's model
engine or forcibly preempt a running generation.

The selected model and effort are mapped independently at each Claude launch:

| Codex selection | Claude alias |
|---|---|
| GPT-6 Astra / GPT-5.6 Sol / GPT-5.5 | opus |
| GPT-5.6 Terra | sonnet |
| GPT-5.6 Luna | haiku |

Low/medium/high/xhigh map to their matching effort values; minimal/none map to low;
max/ultra map to max. These are configurable approximations, not claims of equivalence.
Unsupported combinations fail visibly. Explicit model/effort overrides take precedence.
Only configured subscription model aliases are accepted; `best` is not selected implicitly.

Configuration is a validated JSON document. Read it with `bridge.mjs config`, edit a copy,
and apply it with `bridge.mjs config -` with `{"value": <complete configuration>}` on stdin.
Do not edit settings while a second writer is updating them. Unknown settings are rejected.

## Claude coordinating Codex

The installer also registers a Claude Code plugin (`claude-plugin/`, marketplace
`codex-claude-local`) with a `delegate-to-codex` skill, `codex_*` tools and hooks, and sets a
recorder status line. Skip that half with `node scripts/install.mjs --codex-only`. The same
`mode`, `threshold` and `projects` settings govern both directions; `bridge.mjs disable` stops
both. Start a new Claude session after installing, and review its hooks.

- **Allowance.** Claude Code gives its five-hour and weekly subscription windows only to the
  status line command. `bridge.mjs statusline install` points the status line at
  `scripts/claude-statusline.mjs`, which records the windows to `claude-usage.json` and prints
  `5h N% · 7d N%`; an existing status line is kept and run through it instead
  (`statusline uninstall` restores it). A snapshot older than 20 minutes, or one with an
  expired window, is unknown and never triggers a handoff. Surfaces that do not run a status
  line (headless `-p`, possibly the desktop app) therefore stay unknown until an interactive
  terminal session records one; manual delegation still works.
- **Settings source.** Hooks record the session's working directory and permission mode from
  Claude's own hook input, its effort from `CLAUDE_EFFORT`, and its model from the latest
  assistant reply in the transcript. Until a hook has run, delegation refuses.
- **Model and effort.** `codexModelMap` maps the Claude family (fable/opus/sonnet/haiku) to an
  approved `codexModels` entry; `codexEffortMap` maps effort. Unmapped values use Codex's own
  configured default rather than a guess.
- **Permissions, never widened.** `bypassPermissions` → Codex full access
  (`--dangerously-bypass-approvals-and-sandbox`). `auto` and `acceptEdits` → the
  `workspace-write` sandbox with approvals off (writes inside the checkout, plus a linked
  worktree's Git directory; no network). `default` and `plan` → `read-only`: `default` asks
  before each edit, and Codex exec cannot ask. Any other mode refuses. Under
  `workspace-write` Codex may be unable to push or reach the network; Claude does those steps.
- **Execution.** Each handoff runs `codex exec --json` under the same guardian lease, output
  cap and run limit as Claude workers, with the prompt on stdin. The saved Codex session id is
  resumed per working directory with `codex exec resume`. Codex cannot ask mid-run, so a
  question arrives as a `needs_input` result and is answered by starting again with
  `replySource` (`claude` or `user`) and `replyReason`, within the same supervision budget.
- **Subscription only.** The bridge requires `codex login status` to report a ChatGPT
  sign-in and strips `OPENAI_*`/`CODEX_API_KEY` from the worker. Paid Codex credits cannot be
  detected from `exec` output; manage that in your ChatGPT account.
- **No loops.** Both workers run with `CODEX_CLAUDE_DELEGATED=1`; the hooks of either plugin
  then do nothing and both MCP servers refuse to start a further delegation.

## Sessions, output and supervision

Each Codex task remains a normal saved Codex conversation. The plugin associates its
working directory with a saved Claude session id and resumes it on subsequent handoffs.
It does not create a native Claude model choice inside Codex or import Claude messages as
native assistant turns. Progress and results arrive as tools and Codex commentary; a
read-only loopback viewer can display streamed text in the Codex browser panel. Claude's
own transcript retention still applies: a session deleted by Claude cannot be resumed.

The working directory defaults to the Codex turn's actual directory. An explicit alternate
worktree must share the same canonical Git repository. Changing worktrees selects that
worktree's saved Claude conversation. Codex must wait for the Claude writer to stop before
editing the same files. The bridge prevents overlapping Claude runs per directory, limits
concurrency to two, and never replays a task automatically after a crash.

Claude questions return through its permission-control stream. Codex may answer routine,
reversible clarifications with a recorded reason; substantive product decisions, new
permissions, sending, publishing, spending, and destructive operations still need the user.
A tool permission is not interchangeable with a clarification. The `source: user` field
is the coordinating agent's attestation to an actual user answer, not an independent
approval UI. Structured/prose `needs_input` results resume the same conversation with
`replySource` and `replyReason`. Autonomous supervision is capped at eight replies by default. A genuine user answer
remains allowed at the limit and resets that autonomous budget; its audit record is retained.

Full-access/never-approval Codex turns launch Claude with `bypassPermissions`.
Full-access/on-request turns use Claude's default prompts. Restricted or unknown
sandboxes are refused in this release; there is no prompt-based sandbox emulation.
Business/repository approval rules remain part of the handoff even under full access.

## Subscription billing

The bridge verifies Claude's local authentication is `claude.ai`/`firstParty`, removes
API/provider overrides from the child environment, and rejects provider overrides in known
Claude settings files. It does not read or copy authentication tokens. There is no API-key
fallback. A reported paid-overage event stops the run. **Disable Claude extra usage in your
account if you require a hard subscription-only spending boundary:** the CLI does not
expose an atomic per-run “no overage” switch, and detecting an event cannot undo usage
already incurred. The CLI's reported dollar cost is a list-price estimate, not proof that
an API charge occurred.

## Memory sharing

Native project instruction loading remains unchanged. To enable cross-agent reads, set
`memorySharing: true` and explicitly select relevant Markdown files in
`memorySources[canonicalProjectKey].codex` and `.claude`. No whole-store scan or automatic
cross-project synchronization occurs. Each read returns at most 12 files/16,000 characters
with provenance; symlinks escaping an owner's memory store are rejected.

Sharing requires Codex's native memories to be enabled globally and for the task. Unknown
controls suppress sharing. Claude's disable environment flag or a disabled setting also
suppresses sharing. Custom Claude memory roots must be declared in its settings and files
still explicitly selected. These are read-only exports: each agent writes its own memory
through its normal workflow. With full filesystem access, ownership instructions are not
an OS write barrier. The plugin never joins the stores or rewrites AGENTS.md/CLAUDE.md.

## Cleanup and recovery

Saved chats are disk records, not idle model processes. A run has one guardian and one
Claude process group. Polling `wait` renews the owner lease; status/viewer reads do not.
After 60 seconds without an owner by default, the guardian interrupts Claude, escalates to
terminate/kill if needed, and removes descendants remaining in its owned process group.
A hard two-hour run limit and 16 MiB combined output cap apply by default. Output parsing
and displayed progress are bounded. Completed runs leave the in-memory map; the shared
bridge exits after five idle minutes.

Normal interruption and SessionEnd hooks request a stop. A Codex crash or service crash
is covered by the guardian lease. On recovery the bridge checks saved process identities
before signaling an orphan; it never kills every `claude` process or trusts a PID alone.
Unrecognized ownership blocks a replacement run. Programs that intentionally detach into
new sessions are outside process-group ownership; don't ask workers to launch persistent
servers/daemons without a separately managed lifecycle.

Background mode is opt-in for each run and survives lost leases, but still has time/output
limits and an explicit stop operation. Machine shutdown ends live processes; saved native
Claude conversations survive. Bridge records/logs contain task content, remain local and
private, and can be removed once no run is active; deleting logs does not delete native
Claude chats. There is no cross-machine history synchronization.

## Remote and compatibility boundaries

Install and enable on the machine actually executing the Codex task. Its Claude login,
filesystem and memory stores are used. Authentication on your laptop does not authenticate
the Mac mini. The remote chat displays tool progress normally; the optional loopback viewer
requires a forwarded port to open locally. No inbound network port or SSH connection is
opened by the plugin; its control socket is local and private.

Loaded tasks use the public app-server settings response. Detached desktop tasks use only
the active turn fields required by the bridge and validate that contract before delegating;
new Codex versions remain compatible while the contract is intact and fail closed when it
changes. Per-task memory control similarly checks the database schema before making a
read-only `state_5.sqlite` query because the public read response omits it. Run doctor after
updates. A reinstalled client replaces an idle earlier bridge service automatically and
refuses the upgrade while that service still owns Claude work.
Claude stream/question/resume protocol was tested with the installed Claude Code CLI.
Windows is unsupported. Linux exercises portable tests in CI but is not a desktop support
claim. A host missing authentication is reported; the plugin never copies another host's login.

## Development

```sh
pnpm install --ignore-workspace --frozen-lockfile
pnpm check
pnpm test
```

Tests use fake subprocesses and local fixtures; they do not spend model allowance. Live
subscription smoke checks are explicit and recorded in the task worklog. Dependencies:
standard MCP SDK for transport/schema compatibility, `ws` for the local app-server socket,
and Zod for validated settings/tool inputs. No Morpheus runtime dependency.

Protocol references: [Codex hooks](https://learn.chatgpt.com/docs/hooks),
[Codex memories](https://learn.chatgpt.com/docs/customization/memories),
[Claude headless mode](https://code.claude.com/docs/en/headless), and
[Claude memory](https://code.claude.com/docs/en/memory).
