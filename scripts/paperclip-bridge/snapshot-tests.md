Inspect the immutable Morpheus source snapshot in `source/`. This is a read-only research
job under the existing roadmap claim, not a source authoring or delivery task.

Read `snapshot-manifest.json` for the exact `sourceSha`, `job`, `nonce` and
`artifactRelativePath`. Read `source/tests/paperclip-bridge.test.ts`, the bridge and
authentication helper source, and the integration contract. Select one meaningful
existing boundary test and one plausible remaining test gap. Explain what wrong behavior
the existing assertion would catch, and give a concrete input/failure scenario for the gap.
Do not invent a gap merely to fill the slot: explicitly state when you cannot establish it.

Write only the manifest's artifact path, a JSON object with exactly these top-level keys:
`sourceSha`, `job`, `nonce`, `summary`, `observations`. Copy the first three values exactly
from the manifest. `summary` is one short paragraph. `observations` is an array of two
objects, each with `claim`, `path`, `symbol`, and `evidence`; cite actual test/source names
and explain an observable behavior. Do not claim source correctness from test count alone.

Do not modify the source snapshot, run tests or other repository commands, call
Paperclip/GitHub/provider APIs, enroll agents, create accounts, read credentials, start
another model, or change roadmap/job status. The controller independently inspects the
artifact and owns acceptance.
