# iOS CI simulator ownership

The reusable `ios-ci.yml` gives every test job a unique iOS device matching the requested
destination's runtime and device type. Both build-for-testing and test-without-building address
that job-owned UDID. The nightly test gate calls the same workflow, so it inherits this lifecycle
automatically.

On a persistent self-hosted runner, the action creates one deterministic
`Morpheus CI Template <device type> <runtime>` device, completes its first boot, shuts it down and
clones it for each job. Tests and app installs never use the template itself. A marker inside the
template records the selected Xcode toolchain, so an interrupted warm-up or toolchain change is
completed before the next clone. Template preparation and cloning hold a per-user directory lock;
a later action reclaims a lock whose process has died. Runtime or device changes replace the old
owned template, keeping one template rather than accumulating one per upgrade.

GitHub-hosted runners remain on the pristine-device path because their virtual machines are
discarded after the job and cannot reuse a warmed template. A caller's named simulator is used
only to resolve the requested type/runtime and its data is never copied.

The `ios-simulator` JavaScript action saves a unique job ownership name before creation or clone.
Its `post-if: always()` hook shuts down and deletes that exact device and XCTest's
`Clone N of <owned name>` workers after success, failure or normal job cancellation. Parallel XCTest workers live
in the separate `simctl --set testing` device set (`~/Library/Developer/XCTestDevices`);
cleanup inventories both sets and carries the selector through shutdown/delete.
Cleanup attempts every owned device, surfaces failures, and is safe to repeat. It never
runs `shutdown all`, `delete all`, or deletes a user's original destination. The post hook also
locks and shuts down the exact persistent template if setup was interrupted; it does not delete it.

A hard runner kill, power loss or a cancellation that prevents post actions from executing
cannot guarantee job-device cleanup. The next persistent job safely reclaims an abandoned
template lock and finishes or shuts down the one deterministic template. When recovering an
owned job device manually, first confirm no job still owns
the exact `Morpheus CI <UUID>` device/worker names; invoke `cleanup(name)` from
`.github/actions/ios-simulator/simulator.mjs` in the runner's own macOS account. Do not infer
ownership from all booted devices or from another account's simulator list.

Validate with `node --test .github/actions/ios-simulator/simulator.test.mjs`; `pnpm test`
includes that behavioral suite. The action uses Node built-ins and Apple's `simctl`, with
no dependency installation and no App Store credentials. Archives and visual gallery
publication do not use simulator devices.

Shutdown may race with XCTest completing teardown. Cleanup still attempts deletion of the exact owned device after a shutdown error; a failed deletion remains a job failure.

Fresh serial runners may have no XCTest worker directory. Its specific missing-set diagnostic is treated as an empty optional set; other inventory failures still fail cleanup.
