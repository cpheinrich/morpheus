Inspect the immutable Morpheus source snapshot in `source/`. This is a read-only research
job under the existing roadmap claim, not a source authoring or delivery task.

Read `snapshot-manifest.json` for the exact `sourceSha`, `job`, `nonce` and
`artifactRelativePath`. Read `source/scripts/paperclip-bridge/bridge.ts` and
`source/scripts/paperclip-bridge/cli.ts`, with the integration contract as context.
Trace prepare → committed intent → durable attempt journal → issue POST → exact readback
→ evidence reconciliation. Identify two concrete boundary cases from the actual source.

Write only the manifest's artifact path, a JSON object with exactly these top-level keys:
`sourceSha`, `job`, `nonce`, `summary`, `observations`. Copy the first three values exactly
from the manifest. `summary` is one short paragraph. `observations` is an array of two
objects, each with `claim`, `path`, `symbol`, and `evidence`; name an actual source symbol
and explain the specific guard or failure behavior. Report uncertainty plainly.

Do not modify the source snapshot, execute its commands, call Paperclip/GitHub/provider
APIs, enroll agents, create accounts, read credentials, start another model, or change
roadmap/job status. The controller independently inspects your artifact and owns acceptance.
