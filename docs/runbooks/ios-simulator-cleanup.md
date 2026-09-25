# iOS CI simulator ownership

The reusable `ios-ci.yml` creates a fresh iOS device matching the requested destination's
runtime and device type. Both build-for-testing and test-without-building address its UDID.
The caller's existing simulator is only a template for type/runtime; its data is not copied.
The nightly test gate calls the same workflow, so it inherits this lifecycle automatically.

The `ios-simulator` JavaScript action saves a unique ownership name before creation. Its
`post-if: always()` hook shuts down and deletes that exact device and XCTest's
`Clone N of <owned name>` workers after success, failure or normal job cancellation. Parallel XCTest workers live
in the separate `simctl --set testing` device set (`~/Library/Developer/XCTestDevices`);
cleanup inventories both sets and carries the selector through shutdown/delete.
Cleanup attempts every owned device, surfaces failures, and is safe to repeat. It never
runs `shutdown all`, `delete all`, or deletes a user's original destination.

A hard runner kill, power loss or a cancellation that prevents post actions from executing
cannot guarantee cleanup. When recovering such a runner, first confirm no job still owns
the exact `Morpheus CI <UUID>` device/worker names; invoke `cleanup(name)` from
`.github/actions/ios-simulator/simulator.mjs` in the runner's own macOS account. Do not infer
ownership from all booted devices or from another account's simulator list.

Validate with `node --test .github/actions/ios-simulator/simulator.test.mjs`; `pnpm test`
includes that behavioral suite. The action uses Node built-ins and Apple's `simctl`, with
no dependency installation and no App Store credentials. Archives and visual gallery
publication do not use simulator devices.

Shutdown may race with XCTest completing teardown. Cleanup still attempts deletion of the exact owned device after a shutdown error; a failed deletion remains a job failure.

Fresh serial runners may have no XCTest worker directory. Its specific missing-set diagnostic is treated as an empty optional set; other inventory failures still fail cleanup.
