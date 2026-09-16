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

The contributor's own review, run in their environment before the PR was opened, is kept here as
history rather than as the record: base 5a096dc, reviewed 35b4d35, covered e0bb5b9, one substantive
finding (strict equality rejected legitimate APS development-to-production normalization during App
Store export) fixed and cleared by the same reviewer. The fork author could not apply the upstream
label, and the branch then fell behind trunk, so a maintainer-side review replaced it.


## Maintainer-side independent review (2026-09-16)

Chris approved the PR on GitHub. Under the do-nothing-on-untrusted-input rule a maintainer session
had only triaged it read-only until then; with the owner's approval it approved the workflow runs
(build and tests green), merged trunk into the fork branch, and ran the independent review the fork
author could not complete from this side. The read-only triage had predicted that ad-hoc codesign
would refuse unsigned nested code; the reviewer tested that claim against a real bundle and it was
wrong, which is why the triage is not the record. The maintainer environment could not push to the
fork, so the identical history landed from a repository branch of the same name as #257.

Maintainer-side independent high-risk review of 07c7644c1737edf18e168d135511cb9e260d1017 (the fork branch merged with trunk 76ff450) completed in 6 minutes with no substantive findings, four minor and three incidental. The reviewer ran the PR's exact -showBuildSettings argument set against Evo's real project on Xcode 26.6 and got Evo's three declared claims byte-for-byte, confirmed the on-disk settings dump carries no secrets, ad-hoc signed an app with unsigned nested framework and extension using the script's exact codesign command and found it succeeds (the refusal applies to verify, not sign), checked the empty-dict and no-entitlements cases, matched the test ordering assertions to the script, and confirmed every error path exits non-zero with a message. Minor: the two new temp files were not in cleanup, the build-settings query ran with release secrets in its environment, signing-time variables such as AppIdentifierPrefix fail closed as unresolved, and only APS and iCloud environments are normalized. The author fixed the first two in 46a3ec3, deferred the other two to a follow-on item since no current consumer is affected and both fail closed explicitly, and integrated trunk at 6bd58ee (PRs #254 and #253) in 7b8f9de779b3fb3479eced96a690acc34e67da3f; the same reviewer's follow-up cleared the fixes and the integration in 1 minute. Not verified: the exporter re-applying the ad-hoc entitlements under the distribution identity needs a real nightly run and a device install showing the HealthKit prompt, which remains the item's closing evidence.

```morpheus-review
{
  "version": 1,
  "base": "76ff450cf5c5e1ea88724814c374ac516540e987",
  "reviewed": "07c7644c1737edf18e168d135511cb9e260d1017",
  "covered": "7b8f9de779b3fb3479eced96a690acc34e67da3f",
  "authorSession": "7721007e-1b81-586e-8ac8-39c717a85b5f",
  "reviewerSession": "fable-r250-entitlements",
  "risk": "high",
  "elapsedMinutes": 6,
  "outcome": "complete",
  "summary": "Maintainer-side independent high-risk review of 07c7644c1737edf18e168d135511cb9e260d1017 (the fork branch merged with trunk 76ff450) completed in 6 minutes with no substantive findings, four minor and three incidental. The reviewer ran the PR's exact -showBuildSettings argument set against Evo's real project on Xcode 26.6 and got Evo's three declared claims byte-for-byte, confirmed the on-disk settings dump carries no secrets, ad-hoc signed an app with unsigned nested framework and extension using the script's exact codesign command and found it succeeds (the refusal applies to verify, not sign), checked the empty-dict and no-entitlements cases, matched the test ordering assertions to the script, and confirmed every error path exits non-zero with a message. Minor: the two new temp files were not in cleanup, the build-settings query ran with release secrets in its environment, signing-time variables such as AppIdentifierPrefix fail closed as unresolved, and only APS and iCloud environments are normalized. The author fixed the first two in 46a3ec3, deferred the other two to a follow-on item since no current consumer is affected and both fail closed explicitly, and integrated trunk at 6bd58ee (PRs #254 and #253) in 7b8f9de779b3fb3479eced96a690acc34e67da3f; the same reviewer's follow-up cleared the fixes and the integration in 1 minute. Not verified: the exporter re-applying the ad-hoc entitlements under the distribution identity needs a real nightly run and a device install showing the HealthKit prompt, which remains the item's closing evidence.",
  "findings": [
    { "id": "ENT-R01", "severity": "minor", "description": "expected-entitlements.plist and release-build-settings.json were written under RELEASE_TEMP_DIRECTORY but not removed by cleanup(), so the directory persisted after every run.", "paths": [".github/actions/ios-testflight-upload/upload-testflight.sh"], "disposition": "fixed", "response": "Both paths join the rm -f list (46a3ec3)." },
    { "id": "ENT-R02", "severity": "minor", "description": "The new -showBuildSettings -json query ran with the release secrets in its environment, unlike the existing MARKETING_VERSION query.", "paths": [".github/actions/ios-testflight-upload/upload-testflight.sh"], "disposition": "fixed", "response": "Wrapped in run_without_release_secrets with the redirect on the whole call (46a3ec3)." },
    { "id": "ENT-R03", "severity": "minor", "description": "AppIdentifierPrefix, TeamIdentifierPrefix and CFBundleIdentifier are injected at signing time and not reported by -showBuildSettings, so a consumer using Xcode's Keychain Sharing template fails closed as unresolved.", "paths": [".github/actions/ios-testflight-upload/entitlements.py"], "disposition": "deferred", "response": "No current consumer uses them and the failure is explicit; resolving them from the profile plist is a follow-on roadmap item." },
    { "id": "ENT-R04", "severity": "minor", "description": "Only APS and iCloud container environments are normalized; if export rewrites the App Attest environment a consumer declaring development would be refused with the generic changed-claim message.", "paths": [".github/actions/ios-testflight-upload/entitlements.py"], "disposition": "deferred", "response": "Evo declares production; carried on the same follow-on item." },
    { "id": "ENT-R05", "severity": "incidental", "description": "The exporter re-applying ad-hoc entitlements under the distribution identity cannot be exercised without distribution credentials.", "paths": [".github/actions/ios-testflight-upload/upload-testflight.sh"], "disposition": "deferred", "response": "Acceptance is a real nightly run plus a device install showing the HealthKit prompt; the item does not close on export success alone." },
    { "id": "ENT-R06", "severity": "incidental", "description": "PRODUCT_BUNDLE_IDENTIFIER is a global override, so a project with a Watch app reports two .app targets and fails the exactly-one check; already broken by the override before this PR.", "paths": [".github/actions/ios-testflight-upload/upload-testflight.sh"], "disposition": "deferred", "response": "Covered by the PR's single-main-app scope statement." },
    { "id": "ENT-R07", "severity": "incidental", "description": "Invoking entitlements.py with no arguments raises an uncaught IndexError; unreachable from the script.", "paths": [".github/actions/ios-testflight-upload/entitlements.py"], "disposition": "deferred", "response": "Cosmetic; not changed." }
  ],
  "followUp": {
    "reviewerSession": "fable-r250-entitlements",
    "commit": "7b8f9de779b3fb3479eced96a690acc34e67da3f",
    "base": "6bd58ee8204995e799a96f3298893d3b2196d5d8",
    "scopeReason": "Trunk advanced to 6bd58ee (PRs #254 and #253) after the review; strict branch protection requires integration, so the one same-session follow-up covered the R01/R02 fixes and the integration merge together.",
    "outcome": "cleared",
    "elapsedMinutes": 1,
    "summary": "Follow-up cleared 7b8f9de: the fix commit does exactly R01 and R02 with the redirect still applied to the whole call, bash -n, typecheck and the focused suites (139) pass, and the merge carries only this PR's eight files with the two auto-merged files differing from trunk solely by this PR's hunks."
  }
}
```
