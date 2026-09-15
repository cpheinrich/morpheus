---
roadmap: MO-26-09-15-11.40.14
---
# Preserve TestFlight app entitlements

Evo’s physical TestFlight build reports missing HealthKit. Its source entitlement already exists;
adding another purpose string cannot correct a signature. The shared action compiles unsigned,
then exports a signed IPA, but previously verified only distribution identity.

The fix snapshots the app’s declared Release entitlements using the same build arguments, seeds
them before export with Apple’s ad-hoc codesign, and rejects missing or changed claims in the IPA.
Python’s standard plistlib and Apple’s installed signing tool cover the operation without dependencies.

Validation: focused workflow and entitlement tests, including eight Python cases and a real macOS
ad-hoc signature whose extracted HealthKit claim is true. No distribution export or physical
HealthKit prompt was tested: this account lacks the upstream signing credentials and merge access.
The source screenshot is private and has not been uploaded to this public repository.

Maintainer acceptance: merge the shared action fix, dispatch Evo’s TestFlight release, confirm
“Exported app preserves every declared Release entitlement”, then install the new TestFlight build
and verify the Apple Health permission prompt and a successful read-only sync on the phone.
