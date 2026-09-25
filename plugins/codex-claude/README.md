# Codex Claude

Use a persistent Codex task to coordinate Claude Code on the same machine and checkout,
using the locally authenticated Claude subscription. This package is optional and **off
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
**less than 20% remaining** by default, Codex delegates at the next safe checkpoint.
At exactly 20%, Codex continues. This is subscription allowance, not a token count for a
single chat. Codex still consumes allowance while supervising; this cannot keep Codex
coordinating once its account is exhausted. Missing/stale usage is reported as unknown.
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
`replySource` and `replyReason`. Supervision is capped at eight replies by default.

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

Verified desktop metadata adapters: Codex `0.154.0` and `0.154.0-alpha.6.1`. Loaded tasks can
use the public app-server settings response. Other detached desktop versions fail closed
until an adapter is verified. Per-task memory control uses a version-gated, read-only
`state_5.sqlite` query because the public read response omits it. Run doctor after updates.
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
