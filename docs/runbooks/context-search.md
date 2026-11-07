# Local context search trial

**Read when** enrolling a project, inspecting a search source gap, or
reviewing rollout traces.

`morpheus context search "query"` searches the active worktree and returns
source paths and inclusive line ranges. Start with 1,000 returned tokens.
Use `--max-tokens 2500` for broader questions. Read the cited governing
record before acting. `morpheus context coverage` reports source coverage,
exclusions, tracked paths unavailable in the checkout and unmatched project patterns.

Set `context.search.rollout` in `morpheus.json` with a shared experiment ID
and explicit `coreInputs`. Add project-specific source globs under
`context.search.include` and explicit exclusions under
`context.search.exclude`. The rollout allocates 60% to Tantivy with bounded
startup, 20% to ripgrep with bounded startup, and 20% to ripgrep with full
decisions and lessons. A session must use the same identity in startup,
search and freshness operations. Use the provider session ID where available.
Projects can pin an engine with `context.search.mode`.

Install `tantivy==0.27.0` in a local Python environment. The command checks
`MORPHEUS_TANTIVY_PYTHON`, then
`~/.morpheus/tools/context-search/bin/python`, then `python3`.
The index is disposable per-worktree state under Git metadata. Sources
include decisions, lessons, worklogs, roadmap and other product records,
project instructions, runbooks and canonical meeting notes. Add custom
locations such as `hq/research/**/*.md` to the project manifest. Run
`morpheus context coverage` when adding a source directory.

Human-facing inboxes are outside this trial. A Firebase-based system for
asynchronous human and agent communication is in progress.

Review `morpheus-context-traces/YYYY-MM-DD.jsonl` under the Git common
directory after a few days. Traces are local and expire after 30 days.
Startup tokens estimate the listed required reads with `o200k_base`.
Search time includes source discovery, local engine work and excerpt packing. Compare assigned and actual
engine, startup load, total search time and returned tokens per session.
Context-related reminders need separate review of real tasks. A fast query
does not establish task success or show why a person intervened.
