# CD V2 macOS host integration

Morpheus provides the durable controller and local worker. The templates in `src/cd/host/macos/` provide periodic launchd wakeups on a consumer's signing-capable Mac. They are reviewed source assets; they do not install themselves or authorize a release.

## Prepare the host files

1. Copy all five templates from the same reviewed Morpheus commit into an operator-owned directory. Keep that commit as the trusted runtime/control checkout; the consumer app source checkout must be a different directory.
2. Render the `____` placeholders in the common shell template with absolute paths to the consumer config, app source, immutable Morpheus runtime and credential exec wrapper. Pin the SHA-256 digests of the config and `dist/cli/index.js` as literal values. Render the launchd script and log paths, and choose consumer-unique launchd labels.
3. Set `CD_V2_TICK_OBSERVE=1` in the rendered common shell while the consumer remains in observe mode. The worker does not upload builds, but it can run repair agents; do not load it until the consumer's repair credentials and policy have been reviewed.
4. Keep the credential wrapper executable and ensure it loads credential values into its own process environment before `exec "$@"`. Never source a file that only sets variable names, put values in a plist, or log the environment.

The wrappers pass both `--config` and `--source-dir` explicitly. Before invoking Morpheus, they verify the exact runtime and configuration digests, require distinct source/runtime directories, and refuse unresolved paths. Tests run generated wrappers with spaces in their paths and synthetic credentials.

## Load and inspect

After review of the rendered files, load each job in the logged-in GUI domain:

```sh
launchctl bootstrap "gui/$(id -u)" /absolute/path/to/cd-v2-tick.plist
launchctl bootstrap "gui/$(id -u)" /absolute/path/to/cd-v2-worker.plist
```

Inspect `launchctl print` for both consumer labels and read their separate stdout/stderr logs. Confirm the tick repeatedly reports the intended observe decisions and does not write ledger state. Confirm the worker wakes and idles safely with no due work. Test a process exit and a host login restart; a loaded job is not proof that it can access the credential wrapper or run unattended.

Do not enable active delivery until the consumer has a reviewed cutover plan, exact provider/environment evidence, and proof that its previous controller is fenced and drained. A terminal GitHub job or expired lease alone does not prove the host process or its VM has stopped. If stopping this supervisor, use `launchctl bootout` for its exact labels and verify the jobs are absent; do not terminate unrelated runners or shared VM dispatchers.

## Limits

These assets do not verify credentials, Apple build state, GitHub authorization, billing, VM capacity or process termination. They do not provide a hosted fallback during Mac loss. Consumer-specific tests, environment policy and TestFlight acceptance remain outside Morpheus's generic templates.
