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

Validation: focused workflow and entitlement tests, including ten Python cases and a real macOS
ad-hoc signature whose extracted HealthKit claim is true. No distribution export or physical
HealthKit prompt was tested: this account lacks the upstream signing credentials and merge access.
The source screenshot is private and has not been uploaded to this public repository.

Maintainer acceptance: merge the shared action fix, dispatch Evo’s TestFlight release, confirm
“Exported app preserves every declared Release entitlement”, then install the new TestFlight build
and verify the Apple Health permission prompt and a successful read-only sync on the phone.

## Independent review

Independent review found one substantive compatibility issue: distribution export changes APS environment values. The fix normalizes APS and iCloud environments only when permitted by the pinned distribution profile, retaining strict HealthKit checks. The same reviewer cleared the follow-up with no additional findings. Actual Xcode distribution export and phone sync remain maintainer acceptance checks.

```morpheus-review
{
  "version": 1,
  "base": "5a096dcdd7559aa62c81c8da0241253da68040bd",
  "reviewed": "35b4d3595b5a101dfc7a4e874629c0d11233c74c",
  "covered": "e0bb5b9554661d6603e8691499ca9cfa3dc786de",
  "authorSession": "01a0a655-f986-79d0-a50f-41e64f7aa8fb",
  "reviewerSession": "/root/healthkit_review",
  "risk": "normal",
  "elapsedMinutes": 5,
  "outcome": "complete",
  "summary": "Independent review found one substantive compatibility issue: distribution export changes APS environment values. The fix normalizes APS and iCloud environments only when permitted by the pinned distribution profile, retaining strict HealthKit checks. The same reviewer cleared the follow-up with no additional findings. Actual Xcode distribution export and phone sync remain maintainer acceptance checks.",
  "findings": [
    {
      "id": "R01",
      "severity": "substantive",
      "description": "Strict equality rejected legitimate APS development-to-production normalization during App Store export.",
      "paths": [
        ".github/actions/ios-testflight-upload/entitlements.py"
      ],
      "disposition": "fixed",
      "response": "Normalize documented APS and iCloud environment claims to production only when the pinned distribution profile grants that value; added positive and rejection regression fixtures."
    }
  ],
  "followUp": {
    "reviewerSession": "/root/healthkit_review",
    "commit": "e0bb5b9554661d6603e8691499ca9cfa3dc786de",
    "outcome": "cleared",
    "elapsedMinutes": 1,
    "summary": "R1 fixed; all ten Python tests passed including native signing. No additional findings; distribution export and device acceptance remain unverified."
  }
}
```
