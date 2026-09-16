---
roadmap: MO-26-09-10-07.46.56
---

# Accept TestFlight identities on headless runners

Evo run 34431410127 passed the release tests and imported one distribution
identity on `zoe-mac-mini-evo`, then `security find-identity -p codesigning`
returned no valid SHA. The prior profile-decode fix exposed this next missing
piece rather than completing the self-hosted release path.

Apple's code-signing policy requires a chain from the leaf certificate to a
trusted root. Eligible Xcode versions normally install the WWDR intermediate
for a logged-in user, but the dedicated runner account has no login keychain.
The system keychain on the mini contains only the older WWDR certificate; the
selected Xcode bundles the current `AppleWWDRCA-2030.cer` used by Apple
Distribution certificates.

The action now imports that public G3 intermediate into its already-ephemeral
release keychain. This keeps the runner stateless, preserves the exact
profile/certificate SHA comparison, and fails explicitly if the selected Xcode
ever stops carrying the required certificate. Static regression coverage pins
the import before the codesigning-policy identity check. Acceptance still
requires a forced Evo release on the Mac mini and App Store Connect processing.
