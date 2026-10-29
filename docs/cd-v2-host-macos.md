# CD V2 macOS host integration

Morpheus provides the durable controller and local worker. The templates in `src/cd/host/macos/` provide periodic launchd wakeups on a consumer's signing-capable Mac. They are reviewed source assets; they do not install themselves or authorize a release.

## Prepare the host files

1. Prepare an operator-owned immutable runtime/control checkout at one exact reviewed Morpheus commit. Install Node.js 22 or newer and that commit's locked dependencies with `pnpm install --frozen-lockfile`; committed `dist/` still imports runtime packages. Keep the consumer app source in a physically different checkout; alternate spellings and symlinks to the runtime are refused. Copy all five templates from that same commit into an operator-owned host directory.
2. Render the `____` placeholders in the common shell template with absolute paths to the consumer config, app source, immutable Morpheus runtime and credential exec wrapper. Set `CD_V2_EXEC_PATH` to reviewed absolute executable directories containing Node, GitHub CLI (`gh`), Git and the configured local repair executor and credential-helper dependencies. No login-shell PATH is inherited; empty, relative, unresolved or absent directories are refused. Pin the SHA-256 digests of the config and `dist/cli/index.js` as literal values. Render the launchd script and log paths, and choose consumer-unique launchd labels. Keep the worker's `ProcessType` `Interactive`: launchd runs an `Adaptive` or `Background` job throttled, and a throttled executor misses its quota handshake deadline (#558). The tick stays `Background`.
3. Set `CD_V2_TICK_OBSERVE=1` in the rendered common shell while the consumer remains in observe mode. The worker does not upload builds, but it can run repair agents; do not load it until the consumer's repair credentials and policy have been reviewed.
4. Keep the credential wrapper executable and ensure it loads credential values into its own process environment before `exec "$@"`. Never source a file that only sets variable names, put values in a plist, or log the environment.

The wrappers pass both `--config` and `--source-dir` explicitly. Before invoking Morpheus, they verify the exact runtime and configuration digests, require distinct source/runtime directories, and refuse unresolved paths. Tests run generated wrappers with spaces in their paths and synthetic credentials.

For several native workers sharing one GitHub queue, declare `agents.local` and
omit `agents.hosted` if no hosted repair is wanted. In each reviewed rendered
worker command, append `--host-id MAC_USER_SESSION_STORE_ID`, assigning a unique
stable nonsecret ID to each Mac/user/Codex session store. The unmodified template
defaults to the native hostname; do not rely on that default when hostnames can
collide. Keep IDs stable across restarts and change them when a session store is
replaced. A different or unidentified host starts fresh from the durable task and
checkpoint evidence; it never copies native session or authentication files.
The shared local reservation still serializes repair work across these hosts.
See [repair execution](cd-v2-controller.md#repair-execution-and-capacity) for the
resume boundary. Each host needs its own reviewed credential/CLI readiness proof;
source tests do not establish real failover, and this does not activate a worker.

Before loading jobs, run a no-network runtime check with the reviewed executable search path and installed dependencies:

```sh
env -i PATH=/absolute/reviewed/tools:/usr/bin:/bin:/usr/sbin:/sbin /absolute/reviewed/tools/node /absolute/runtime/dist/cli/index.js cd config --config /absolute/consumer/.morpheus/cd.json
```

Expect JSON with `"valid":true` and the intended consumer repository. Then exercise both rendered wrappers with the sparse inherited PATH `/usr/bin:/bin:/usr/sbin:/sbin`; their rendered `CD_V2_EXEC_PATH` must resolve the real Node CLI, `gh` subprocesses and executor prerequisites without a login shell. This prerequisite check does not verify provider credentials or authorize activation.

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
