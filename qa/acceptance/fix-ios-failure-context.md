# iOS workflow failure context correction

- Real actionlint accepts all shipped workflows. Reintroducing any status
  function into a native step environment, script or name expression is rejected
  by the real checker, while valid step conditionals remain accepted.
- The native capture runs before all artifact stages and writes exactly
  `failed=true` only when scope is true and the pre-artifact job status is failure.
  Success, allowed continue-on-error, skipped work, cancellation before capture
  and missing/false scope leave the output absent.
- Exact-true diagnostic stage/upload selectors retain the captured decision
  despite later artifact failure or cancellation. Artifact admission failure
  still prevents every native upload through the existing all-selected barrier.
- Morpheus's existing required Node check runs pinned, checksummed actionlint
  before tests. The reusable option defaults false and adds no job or artifact;
  tool acquisition is bounded and supports its declared Linux X64 platform.
- Focused workflow, artifact and CI-scope tests, typecheck, compile and generated
  PM indexes pass locally. Independent high-risk review, final-head CI and
  protected merge remain required before source completion.
- Source completion does not claim consumer adoption, a host change, a native
  workflow execution, a provider upload or TestFlight delivery.
