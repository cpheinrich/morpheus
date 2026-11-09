# Local context search trial

**Read when** enrolling a project, inspecting a search source gap, or
reviewing rollout traces.

`morpheus context search "query"` searches the active worktree and returns
source paths and inclusive line ranges. Start with 1,000 returned tokens.
Use `--max-tokens 2500` for broader questions. Read the cited governing
record before acting. `morpheus context coverage` reports source coverage,
exclusions, tracked paths unavailable in the checkout and unmatched project patterns.

## Morpheus Context MCP

The local stdio server uses the same source inventory, session assignment and search engines as
the CLI. Register it for the device's agent clients after installing reviewed Morpheus:

```sh
codex mcp add morpheus_context -- morpheus context mcp
claude mcp add --scope user morpheus_context -- morpheus context mcp
```

Reopen the project session to load the server. Factory launchers register it for admitted Morpheus
worktrees, including workers with isolated client configuration. The model supplies a query or a
repository-relative citation. The host supplies the session identity and checkout.

| Tool | Use |
|---|---|
| `search_project_context` | Find ranked excerpts, optionally limited to record kinds |
| `read_project_record` | Read a contiguous cited line range |
| `check_context_coverage` | Check which tracked Markdown is eligible or unavailable |
| `get_context_overview` | Orient a fresh agent with portable task and architecture pointers |
| `get_related_context` | Traverse explicit roadmap, Markdown and GitHub links with source-line evidence |

Set `context.search.transport` to `mcp` on a participating project. This chooses the preferred
interface for all existing arms without changing their assignment. CLI search remains a fallback.
The MCP result includes the exact excerpt in the model-facing result so the host read hook can
verify the citation. The existing startup and read hooks enforce the bounded check. The
first-prompt reminder also runs when its hook is trusted. Use `morpheus context install` to install the current hooks.

Use `morpheus context profile [YYYY-MM-DD]` for local results by arm, transport and actual engine.
It reports call timing, empty results, overrides, build and cache behavior, and independently
observed excerpts. Older query rows without a transport are CLI. Use
`morpheus profile report --repo <name> --since YYYY-MM-DD` for session time, requests and token use
grouped by observed interface. This cutover changes transport for every arm, so a historical
CLI-to-MCP comparison is observational. The engine comparison still uses the existing arms.
Traces omit raw queries, document text, local paths and provider session IDs.

The MCP starts warming the current worktree's full Tantivy index when the host launches
the server. Codex's app-server can do this as soon as it starts a project thread, before the
first turn. The desktop controls when it creates that thread. Warming runs in the background
while the server connects, and a search for the same index shares a build already in progress.
The cache is content-addressed. A different checkout, changed sources or a kind-filtered corpus
can still need a build. The experiment assigns its search arm when the session identity arrives.
A pilot worktree can warm before that identity is known, including for a later ripgrep assignment.

The `pipeline` report gives sample counts and timing from the earliest observed session hook or
MCP process launch to the first prompt, then to the first search and first nonempty search result.
The read hook supplies a separate time to the first result observed by the host. Warm-up
duration, build time, cache hits, failures and first-search index waits are separate.
Prompt times use the prompt hook when available and otherwise the first turn boundary from the
matching local Codex transcript. The report counts missing boundaries and does not time the
desktop click itself. It stores no prompt or search text.

For the bounded arms, install the task prompt and read hooks with
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

Set `context.search.rollout` in `morpheus.json` with a shared experiment ID
and explicit `coreInputs`. Add project-specific source globs under
`context.search.include` and explicit exclusions under
`context.search.exclude`. The rollout allocates 60% to Tantivy with bounded
startup, 20% to ripgrep with bounded startup, and 20% to ripgrep with full
decisions and lessons. A session must use the same identity in startup,
search and freshness operations. Use the provider session ID where available.
Projects can pin an engine with `context.search.mode`. To explicitly use
Tantivy for the current session and worktree, run
`morpheus context engine tantivy`. Run `morpheus context engine auto` to
return to the assigned engine. If the shell lacks a provider ID, pass the
ID printed by startup with `--session-id` to both commands. A pin changes
search, while startup requirements still follow the assigned arm. Queries
record any override so comparisons can exclude manually selected engines.

Install `tantivy==0.27.0` in a local Python environment. The command checks
`MORPHEUS_TANTIVY_PYTHON`, then
`~/.morpheus/tools/context-search/bin/python`, then `python3`.
The index is disposable per-worktree state under ignored `local/context-search/cache/`. Sources
include decisions, lessons, worklogs, roadmap and other product records,
project instructions, runbooks and canonical meeting notes. Add custom
locations such as `hq/research/**/*.md` to the project manifest. Run
`morpheus context coverage` when adding a source directory.

Human-facing inboxes are outside this trial. A Firebase-based system for
asynchronous human and agent communication is in progress.

Review `local/context-search/traces/YYYY-MM-DD.jsonl` in each worktree.
Older traces remain under `morpheus-context-traces/` in common Git metadata.
New active traces expire after 30 days. On removal of a verified task
worktree, cleanup moves its search state to the common Git directory under
`morpheus-context-archives/`, where it remains available for comparison.
Startup tokens estimate the listed required reads with `o200k_base`.
Search time includes source discovery, local engine work and excerpt packing. Compare assigned and actual
engine, startup load, total search time and returned tokens per session.
Context-related reminders need separate review of real tasks. A fast query
does not establish task success or show why a person intervened.
