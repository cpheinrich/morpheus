# Simulator watchdog

A booted iOS simulator holds RAM and keeps CoreSimulator, `log` streams and `serve-sim` busy, and
every device carries 2-5 GB of state. On 2026-10-06 one Mac hit 100% disk with 85 GB of simulators
on it, most belonging to checkouts nobody had touched in days. The watchdog shuts down any
simulator that has been booted for 24 hours with no activity in it.

It only ever runs `simctl shutdown` on one named device. It never deletes, never erases and never
runs `shutdown all`, so the worst a wrong decision costs is a reboot. Shutting a device down frees
its RAM, not its disk: reclaiming the disk is `xcrun simctl erase <udid>` or `delete`, a separate
decision this tool deliberately does not make.

`morpheus qa preview ios` already ends its own device after a four-hour lease, and CI jobs delete
the devices they create. The watchdog covers what neither does: Xcode runs, the Simulator MCP,
hand-booted devices, XCTest clones left booted by a killed run, and a preview whose supervisor died.

## Turn it on, once per Mac

```sh
morpheus simulator watchdog enable [--idle-hours 24]
morpheus simulator watchdog status
```

`enable` records the choice in `~/.morpheus/simulator-watchdog.json` and installs
`~/Library/LaunchAgents/morpheus.simulator-watchdog.plist`, which sweeps at login and every
30 minutes. It runs the *installed* `morpheus`, so a Mac needs `morpheus self install` first.
Enabling is an explicit device action, like `codebase-memory install`; installing Morpheus never
turns it on. `morpheus doctor` (for a project that declares `qa.ios`) and `morpheus qa preview ios
start` say when a Mac has not decided, and say nothing once it has, either way.

`morpheus simulator watchdog disable` removes the agent and records the choice. `self update` and
`self ensure` repair an enabled agent after an update (they run `watchdog refresh`) and never
re-enable one that was disabled.

## What "idle" means

A device is shut down when **both** hold:

1. it has been booted for at least the threshold, read from the age of its `launchd_sim` process;
2. nothing counted as activity inside the threshold.

Activity is any of:

- a write inside a **user-installed** app's data container, or an install or reinstall of one
  (`simctl listapps` marks these `ApplicationType = User`);
- a heartbeat file the QA overlay writes whenever it forwards a touch or a key
  (`~/Library/Caches/morpheus/simulator-activity/<UDID>`), which is how someone who is only looking,
  scrolling and tapping, stays alive.

Apple's own apps do not count. Measured on a real idle simulator, logd, IdentityServices,
`com.apple.xpc.activity2`, the News widget cache, chrono widget timelines and Intelligence embeddings
are all rewritten every few minutes, so counting them would make every device look busy forever.

Anything the watchdog cannot measure keeps the device up: no readable boot time, a `listapps`
failure, a container too large to walk, a running `xcodebuild` that names the device by UDID. Both
simulator sets are covered, the default one and XCTest's parallel clones in
`~/Library/Developer/XCTestDevices`.

## Reading what it would do

```sh
morpheus simulator watchdog run --dry-run
```

```
· kept Evo QA fbede220ad7a (714B…): booted 30h 00m ago; evo.med.staging wrote data 2h 00m ago
~ would shut down Lakina QA 27dd9e977b67 (EA1C…): booted 41h 12m ago with no activity in the last 24h
```

`run` without `--dry-run` does it. `--idle-hours N` overrides the threshold for one run (1 to 720);
`enable --idle-hours N` stores it. The launchd job passes `--quiet`, so its log,
`~/Library/Logs/morpheus/simulator-watchdog.log`, holds only shutdowns and failures.

## When it is wrong

- **It shut something down you were using.** Boot it again; nothing was lost, because shutdown keeps
  the device's data. Raise the threshold with `enable --idle-hours 48`. If the app only reads and
  never writes, that is the case the heartbeat exists for: drive it through
  `morpheus qa preview ios` and every touch counts.
- **It never shuts a device down.** Run `run --dry-run`. A device kept as "wrote data" has an app
  that writes on a timer, for example analytics or a Firebase heartbeat, which this reads as use.
  A device kept as "could not be measured" names why.
- **launchd would not load the agent.** `enable` prints the reason and leaves the agent on disk to
  load at the next login. An SSH session has no GUI login domain; run `enable` from the Mac itself.
- **The log shows `Unknown command "simulator"`.** The agent points at an installed Morpheus that
  predates this command. `morpheus self update`, then `morpheus simulator watchdog refresh`.

Validate with `pnpm vitest run tests/simulator-watchdog.test.ts tests/simulator-agent.test.ts`.
The sweep takes `simctl`, `ps` and `launchctl` as injectable commands; the tests script them and the
behaviour was also verified against real simulators and a real launchd agent
(`.agent/worklog/MO-26-10-06-22.53.44.md`).
