---
roadmap: MO-26-10-12-12.30.40
---
# Select archive configuration and preserve spaced names

Verified #325 in the composite action and both xcodebuild configuration sites. Added a Release-
defaulted configuration input, wrote BUILD_CONFIGURATION through the validated job environment,
and used it in metadata and archive argument construction. Scheme/configuration retain spaces,
while blanks and CR/LF fail before GITHUB_ENV mutation. Path restrictions remain unchanged.

New executable tests run the actual validation shell prefix and actual metadata/archive shell
blocks with a logging Xcode stand-in, proving default/override consistency, one-argument spaced
names, literal shell-looking data, and blank/CR/LF refusal. Removed superseded source-text checks.
The first test asserted an irrelevant environment-line ordering; replaced it with exact key/value
assertions. No new dependency or live signing/upload. Graph tools unavailable; source fallback.

Validation: frozeninstall;169 focusedtests across upload-configuration/workflows/upload-receipt/signing-lock; typecheck,compile,pmindex,lint,inbox,bashsyntax,diffchecks passed. Fullpnpmtest passed2122tests/77files in71.71seconds.
