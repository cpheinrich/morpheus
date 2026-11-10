# Local context search

**Read when** enrolling a project, inspecting a search source gap, or
reviewing search traces.

`morpheus context search "query"` searches the active worktree and returns
source paths and inclusive line ranges. Start with 1,000 returned tokens.
Use `--max-tokens 2500` for broader questions. Read the cited governing
record before acting. `morpheus context coverage` reports source coverage,
exclusions, tracked paths unavailable in the checkout and unmatched project patterns.

## Morpheus Context MCP

The local stdio server uses the same source inventory, and pinned Tantivy engine as
the CLI. `morpheus init` configures new projects. For an existing project, run:

```sh
morpheus context install --check  # report missing project setup without writes
morpheus context install          # merge setup, preserving unrelated settings
```

Setup adds `.mcp.json` for Claude Code, `.codex/config.toml` for Codex and
`.cursor/mcp.json` for Cursor. These portable project settings travel with the repository,
so collaborators and other execution hosts get the same server entry after pulling the rollout.
They locate each device's installed Morpheus; they contain no credentials or personal paths.
Existing conflicting or disabled entries, malformed settings and symlinks are left untouched
and reported. `context install` appends discovery/fallback guidance to `AGENTS.md`; `init`
keeps existing authored instructions unchanged and includes the guidance in new scaffolds.

Install reviewed Morpheus and its Tantivy runtime on each execution host, grant the client's project/server trust and
reload the session. Opted-in CLI auto-updates also provision user-scoped
registrations for existing checkouts on that device, without changing project files.
See [device bootstrap](device-bootstrap.md#context-search-after-an-automatic-update)
for upgrade and reload behavior. Codex CLI, IDE and desktop share Codex configuration. A user-level MCP entry
can be used when project setup is unavailable, but is not a substitute for verifying the launch
checkout and an actual tool call. Session startup now cues discovery even outside the pilot;
it can complete local registration on opted-in devices after a legacy upgrade. Factory launchers continue registering the
server for admitted worktrees, including workers with isolated client configuration.

### Desktop, phone and cloud boundaries

| Surface | Where tools execute and what must be configured |
|---|---|
| Codex / Claude Code / Cursor on a Mac | Project settings plus that Mac's installed Morpheus, checkout and client trust |
| Phone via SSH or remote desktop | On the selected Mac; reconnect/reload the host session after setup |
| ChatGPT mobile remote Codex | On the paired desktop host; each host needs setup and the phone must be paired with it |
| Claude Desktop local MCP | Its separate desktop client configuration; bind each server to an explicit project checkout, since the app's launch directory is not a project |
| Standalone ChatGPT / Claude web or mobile | A separately authorized supported remote connector; local stdio project files cannot register a cloud connector |

For a standalone cloud chat without a connected execution host, use its authorized repository
connector to read governing records and cite the revision; disclose the fallback and any missing
checkout state. If neither repository access nor an authenticated remote MCP exists, report the
missing connection. Do not claim all devices/users are configured merely because project files
were committed. Never expose a private checkout through an unauthenticated network endpoint.
See [Codex remote connections](https://learn.chatgpt.com/docs/remote-connections) and
[Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

| Tool | Use |
|---|---|
| `search_project_context` | Find ranked excerpts, optionally limited to record kinds |
| `read_project_record` | Read a contiguous cited line range |
| `check_context_coverage` | Check which tracked Markdown is eligible or unavailable |
| `get_context_overview` | Orient a fresh agent with portable task and architecture pointers |
| `get_related_context` | Traverse explicit roadmap, Markdown and GitHub links with source-line evidence |

Use the MCP first for governing decisions, lessons, roadmap, worklogs, runbooks and meeting
notes. Use `read_project_record` to open relevant citations. Review packets and Factory handoffs
carry this rule; the advisory `SubagentStart` hook gives fresh Codex and Claude Code subagents
the same cue. Use `morpheus context install` to add that hook to an existing project and trust
it in the client. For code structure use codebase-memory; for code, diffs and exact literals
use the usual tools. When MCP is unavailable or scoped to the wrong checkout, run
`morpheus context search` from the assigned worktree and report the fallback.

Use `morpheus context profile [YYYY-MM-DD]` for call timing, empty results, index builds, cache
behavior and independently observed excerpts. It still reads historical engine cohorts and
overrides. Use `morpheus profile report --repo <name> --since YYYY-MM-DD` for session time,
requests and token use grouped by interface. Traces omit raw queries, document text, local
paths and provider session IDs.

The MCP starts warming the current worktree's full Tantivy index when the host launches
the server. Codex's app-server can do this as soon as it starts a project thread, before the
first turn. The desktop controls when it creates that thread. Warming runs in the background
while the server connects, and a search for the same index shares a build already in progress.
The cache is content-addressed. A different checkout, changed sources or a kind-filtered corpus
can still need a build.

The `pipeline` report gives sample counts and timing from the earliest observed session hook or
MCP process launch to the first prompt, then to the first search and first nonempty search result.
The read hook supplies a separate time to the first result observed by the host. Warm-up
duration, build time, failures and first-search index waits are separate. A launch warm can
finish before the prompt even if the actual search uses another corpus. The
first-search cache-hit count measures whether that search reused its own index.
Prompt times use the prompt hook when available and otherwise the first turn boundary from the
matching local Codex transcript. The report counts missing boundaries and does not time the
desktop click itself. It stores no prompt or search text.

For compact startup, install the task prompt and read hooks with
`morpheus context install` and make sure both are active in the client. On
the first user prompt, Morpheus asks the agent to search when the task is
known, before implementation. For a known governing record, use
`morpheus context task-read <indexed-path> [start-line]` to open a cited
excerpt directly. If the query is empty, refine it or read a known record.
Read the full governing section when a decision or constraint applies.

Before the first governed action, the freshness gate checks for a result
the read hook actually observed in that session. An empty search, a
redirected result or an excerpt from the already-required startup core
does not satisfy it. Evidence follows the session across linked worktrees,
and an excerpt is verified against the checkout that returned it. The core
receipt remains a separate check. A terminal or a session without active
prompt and read hooks keeps the existing freshness policy. A checkout with
no readable task records falls back to the core and reports how to check
coverage. The task hook stores no prompt or excerpt text.

Tantivy is the only search engine. Old `context.search.mode` values and per-session engine pins
no longer select an engine. Projects already declaring `context.search.rollout.coreInputs`
keep their compact startup records; other projects keep full startup. The session ID still
links startup, search and freshness evidence when the host supplies it. Set
`context.search.transport: "cli"` only for a project whose startup cue must use the CLI.

A managed update installs the pinned `tantivy==0.27.0` wheel in a user-local Python
environment before replacing the CLI. Python 3.11+ with `venv` and access to PyPI are required
for the first installation. Run `morpheus context runtime install` for a manual repair or a
source checkout. The installer reuses a working environment. Restart the client or start a
fresh session so it launches the new MCP process. A missing or broken runtime produces a
setup error; search does not switch engines.

The index is disposable per-worktree state under ignored `local/context-search/cache/`. Sources
include decisions, lessons, worklogs, roadmap and other product records,
project instructions, runbooks and canonical meeting notes. Add custom
locations such as `hq/research/**/*.md` to the project manifest. Run
`morpheus context coverage` when adding a source directory.

Human-facing inboxes are outside the search index. A Firebase-based system for
asynchronous human and agent communication is in progress.

Review `local/context-search/traces/YYYY-MM-DD.jsonl` in each worktree.
Older traces remain under `morpheus-context-traces/` in common Git metadata.
New active traces expire after 30 days. On removal of a verified task
worktree, cleanup moves its search state to the common Git directory under
`morpheus-context-archives/`, where it remains available for comparison.
Startup tokens estimate the listed required reads with `o200k_base`.
Search time includes source discovery, local engine work and excerpt packing. Compare startup load, total search time and returned tokens per session.
Context-related reminders need separate review of real tasks. A fast query
does not establish task success or show why a person intervened.
