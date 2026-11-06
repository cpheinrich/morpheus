# Worker storage and CI capacity

- Audit candidate allocated bytes and actual available space; disclose APFS sharing.
- Closed-app cache cleanup preserves profiles, sessions, VM bundles and native runtime data.
- CI cache pruning shares actual dispatcher path identity, preserves configured repo/slot
  disks and refuses active/uncertain owners, symlinks, changed files and open disks.
- Preserve build/simulator guards where the measured disk use gives no reason to relax them.
- Independent source review and passing CI precede protected merge and installation.
- Drain and unload the target dispatcher before reducing two slots to one. Keep the other
  host's two-VM configuration unchanged. Install from exact reviewed source.
- Target VM: 8 vCPU / 16384 MiB, host-declared simulator lanes 2. First attempt uses native
  Xcode parallel testing YES with maximum 2; retry attempts remain serial.
- Real test-only CI evidence identifies the actual target host/VM, resources, two workers,
  expected and executed tests, evidence artifacts and terminal success. No upload or Apple effect.
- Measure recovered available space, verify VM teardown and dispatcher readiness, and confirm
  Hermes, gateway/Colima and delivery-controller health without changing their state.
- Source-ready preparation is not completed operational acceptance; retain the item until
  the supervisor verifies the deployed result.
