# Artifact snapshots

`stage.py` is the single six-channel byte admission and immutable-copy definition.
`action.yml` supplies only the closed channel; `ci_trace_stage.py` is a fixed Morpheus
CI diagnostic role bound to the exact core SHA-256. Update that binding when the core changes.

Preserve names, layouts, explicit retention and the successful-own-stage upload guards.
Never upload an original writer directory after admission failure. See
[the contract](../../../../docs/artifact-snapshots.md) for the ZIP bound, writer boundary,
consumer adoption and remaining provider/ABI qualifications. The helper's initial
prototype docstrings record its provenance; they grant no operation authority.

Receipt leaves additionally bind SHA-256 of the producer's validated canonical receipt
directory. Never rotate that directory to retry a spent invocation; output availability
is not a namespace. Missing optional audit roots may be EMPTY; linked roots must refuse.
