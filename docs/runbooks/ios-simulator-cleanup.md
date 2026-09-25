# iOS CI simulator ownership

The reusable `ios-ci.yml` creates a fresh iOS device matching the requested destination's
runtime and device type. Both build-for-testing and test-without-building address its UDID.
The caller's existing simulator is only a template for type/runtime; its data is not copied.
The nightly test gate calls the same workflow, so it inherits this lifecycle automatically.

The `ios-simulator` JavaScript action saves a unique ownership name before creation. Its
`post-if: always()` hook shuts down and deletes that exact device and XCTest's
`Clone N of <owned name>` workers after success, failure or normal job cancellation.
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
