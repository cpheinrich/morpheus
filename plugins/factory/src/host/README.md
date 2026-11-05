# Factory host package

Optional host and fleet tooling for the Factory plugin. Nothing here runs when the plugin
or Morpheus is installed: every command is an explicit capability setup an operator runs on
the Mac it changes.

Imported from the public `cpheinrich/morpheus-factory` repository at commit
`a67e1b0c139c83118a2364bfa43f1cfb5403eef0` (no history), with personal configuration
removed and fixtures replaced by synthetic values.

| Path | What |
|---|---|
| `core/` | TypeScript placement, admission and broker core (`dist/cli.js`: `plan`, `profiles`, `hosts`) |
| `worker/` | Worker setup, per-host Xcode update controller, runner and LaunchAgent installers |
| `worker/host_config.py` | The one boundary for the private host manifest |
| `fleet/` | Cross-repository Xcode pin coordinator and scoped GitHub auth |
| `scripts/` | Storage watchdog, worktree cleanup, sub2api gateway install |
| `docs/` | Design, host updates, storage policy, sub2api runbook |
| `examples/` | Synthetic catalog and host manifest |
| `tests/` | Vitest (`core/`) and unittest (everything else) |

## Private configuration

Real hosts, paths, runner labels and devices live only in an owner-only JSON file outside
every Git checkout (a manifest inside one, or reached through a link, is refused), `$FACTORY_HOME/hosts.json` (default `~/.local/share/factory/hosts.json`), holding
references (variable names, paths), never secret values:

```sh
python3 worker/host_config.py import --from /path/to/manifest.json   # exclusive, mode 600, never overwrites
python3 worker/host_config.py check
```

`examples/hosts.example.json` shows the shape. Every reader validates through
`host_config.py`; a later Firestore source will produce the same data and call the same
validator.

## Commands

```sh
pnpm install --frozen-lockfile     # this directory has its own workspace file and lockfile
pnpm typecheck && pnpm test && pnpm build
bash worker/setup.sh --check       # report only; changes nothing
bash worker/setup.sh               # explicit worker setup (Homebrew tools, root helper, watchdog)
python3 worker/install_updates.py --host <host> --github-user <login>   # hourly Xcode tick
python3 worker/install_updates.py --rollback                           # restore the previous tick
scripts/setup-sub2api.sh           # sub2api gateway (Docker), see docs/sub2api.md
```

Rules carried over: no secrets in files, specs or logs (`core/config.ts` rejects a
key-shaped `keyRef`); refusals are data; placement stays pure; fail closed on unknown quota.
See `docs/design.md`, `docs/host-updates.md` and `fleet/README.md`.

## Migrating a host from the `morpheus-factory` checkout

Live hosts keep running from their source checkout until an operator moves each one; this
package does not touch them. Per host, when no tick is running:

1. Install the plugin (`node plugins/factory/scripts/install.mjs`), then, in the installed
   copy (`~/plugins/factory/src/host`), `pnpm install --frozen-lockfile && pnpm build`.
2. Preserve the existing manifest privately:
   `python3 worker/host_config.py import --from <checkout>/worker/updates.json`.
   Edit `paths.factory` and any `validation` argv that names the old checkout to point at
   the installed copy; keep every other value.
3. `python3 worker/install_updates.py --check --host <host> --github-user <login>`, then the
   same without `--check`. The previous LaunchAgent is kept as `….plist.previous`; a running
   tick refuses with exit 75 (retry later).
4. Watch one tick in `~/Library/Logs/morpheus-factory/host-updates.log`. To go back:
   `python3 worker/install_updates.py --rollback`.
5. Rerun `bash worker/setup.sh` from the installed copy so the storage watchdog's scripts
   come from it (an unchanged watchdog is left running). Project simulator names are no
   longer built in: declare job-device prefixes and QA preview namespaces in
   `~/.config/morpheus-factory/simulators.json` (see `docs/development-cache.md`), and name
   runners another installer owns in `FACTORY_RESERVED_RUNNERS` before `worker/runner.sh`.

Retire the source checkout only after every host has run from the installed copy. The
source repository's own history still contains the personal manifest; cleaning it is a
separate change.
