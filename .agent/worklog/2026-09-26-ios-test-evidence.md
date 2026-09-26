# Selected iOS tests and complete result evidence

Roadmap: MO-26-09-26-13.59.22

Adds opt-in selection and caller-owned result verification to the shared workflow. Full nightly
coverage remains unchanged. Structured results, exact checked-out SHA, selection and logs survive
success as well as failure. Retry success no longer erases the evidence needed for diagnosis.

Validation: 141 workflow tests passed, including executable Bash checks for literal selection
arguments, default full selection, manifest preservation, validator failure and failed export.
Actual Xcode execution will also be exercised by the Evo rollout; this reusable repository has
no native application fixture. No provider or device state changed in these tests.

Independent review: pending.
