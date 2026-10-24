# Read-only snapshot linkage acceptance

Two execution jobs (`inspect-lineage` and `inspect-tests`) share roadmap
`MO-26-10-23-00.15.26` and the same exact committed source SHA. Each has a distinct
operation ID, Paperclip issue ID, runtime nonce, artifact path and independently verified
receipt. These are source inspection jobs; they do not qualify consumer source authoring,
protected delivery per host, simulator access, failover, or restart adoption.

The operator exports `git archive <sourceSha>` into a dedicated runtime `source/`
directory outside the task checkout. `snapshot-manifest.json` beside it names the source
SHA, job key, fresh nonce, artifact relative path and a SHA-256 inventory of the source
files. No token, owner session, provider credential or private evidence is in that workspace.
The same source-file inventory must match before and after execution. Run each bounded
job with the qualified artifact-only sandbox and controller-owned status updates.

Acceptance requires controller-side readback of the exact planned issue and artifact:

1. The issue has the exact Git linkage, company/project/assignee and original operation.
2. Artifact JSON has exactly `sourceSha`, `job`, `nonce`, `summary`, `observations`.
   The first three equal the operator manifest, the summary is nonempty and there are
   exactly two observations with nonempty `claim`, `path`, `symbol`, `evidence` strings.
3. Every cited path is a regular file in the frozen snapshot, and each symbol/evidence
   reference is checked against those bytes. A model's assertion is not that check.
4. Snapshot file inventories match and no source file was changed. Artifacts are confined
   to the two planned output paths. Requested and observed model/effort remain separately
   recorded; an unknown served model remains unknown.
5. The operator copies only the reviewed artifacts and a sanitized verification receipt
   into this task branch, commits them, then uses bridge `reconcile` with exact artifact
   SHA-256 values. No credentials or private service logs enter Git.

Record an actionable blocked result if any identity, confinement or evidence check fails.
The broader qualification remains in
[MO-26-10-23-19.45.05](../../hq/product/roadmap/MO-26-10-23-19.45.05-qualify-paperclip-consumers.md).
Job completion cannot close the parent or that follow-up automatically.
