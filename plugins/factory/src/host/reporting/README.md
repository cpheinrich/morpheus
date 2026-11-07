# Optional read-only infrastructure reporter

Run only from an explicitly installed host package with its own pinned dependencies. Nothing
in ordinary Morpheus installation enables this reporter. `protocol.mjs` is the canonical v1
wire boundary; consumers vendor its exact bytes with provenance until distribution is needed.

One-shot `node reporting/reporter.mjs --config /absolute/private/reporting.json` reads only
registered sources, sends one HTTPS report and exits. launchd serializes that invocation every
60 seconds. Errors are fixed messages; no queue, recovery, model probe or job control. Raw
records, paths, native account credentials and free-form worker text never enter the payload.

The owner-only config has version1, hostId, HTTPS endpoint, tokenEnv, projectPaths (explicit
common-Git directory or checkout prefix to owner/repo), routeAccounts (route name to stable account ID), and sources.
Kinds: machine; factory (roots, desktop/unattended channel); routes (configPath); dispatcher
(configPath,statePath,serviceLabel,tartPath,projectIds,roles); runners (entries with explicit metadataPath,
projectIds, repository/organization scope, eligible roles and labels); phone (leasePath, optional enrolled deviceUdid); quota (binding with opaque id,
instanceId, exact numeric accountId, provider, baseUrl; emailEnv/passwordEnv); github (at most
three registered repositories, optional organizationRunners exact organization/runnerId/projectIds and organizationTokenEnv). The company owns real configuration outside Git. Gateway
admin references are resolved only by an existing credential wrapper, never copied into config.

Register default Factory home and every explicitly configured service home. Discover them
from trusted launchd/wrapper metadata, not arbitrary home scans. The steward's runner can
inherit the default Factory home: its config-file directory alone does not establish a state
root. A missing enrolled root is partial. Empty reservations and incomplete preparation retain
separate history warnings. A canonical reconciliation hash proves only record association.
Current exact guardian/worker and owned-process evidence must also exclude a live contradiction.
The standalone package includes the unchanged canonical Python proof readers, invoked with -B.

Quota defaults to stored mode. Its authenticated gateway reads use the same redirect/body bounds
and confidential transport. HTTP stored enrollment also requires the explicit pinned tailnet binding. Explicit provider mode requires an exact positive account ID,
subjectSha256, pinned gatewayOrigin, directEgress true and, for HTTP over the existing encrypted
tailnet, a verified tailnetAddress. The designated local writer authenticates through its existing
credential wrapper, reads exact account metadata and a singleton credential export in memory,
then GETs the fixed vendor usage endpoint. Export includes proxy metadata so direct-only
eligibility can be checked. Every authenticated hop refuses redirects and bounds decoded bytes. HTTP connects directly to
the enrolled peer IP with the original Host header, verifies the connected socket address before
flushing credentials, and checks current online Tailscale peer identity/status first.
Normal OAuth identity, expiry, credential metadata, subject and owner revision are checked before
publication. Missing, changed, expired, shadow, parent, PAT, agent or proxy-bound credentials refuse.
No OAuth refresh, account maintenance or inference is performed. Proxy environment inheritance is
refused. Owner metadata is reread after the provider request. This detects drift without locking
future owner settings. Enrollment must verify the existing direct-egress configuration.
Only successful actual provider reads advance source time. Missing or expired windows stay unknown.

The optional organization reader GETs only enrolled org/runner IDs using a separate environment
reference. It does not list the organization or reuse/modify repository credentials. Enrollment
and server registration must bind the same owner, exact ID and eligible project set. Deduplicated
identities use one request across eligible projects. Missing credentials or denied reads retain
per-identity gaps independently of repository census coverage. The capability required is GitHub
organization Self-hosted runners read. This package creates no credential or permission grant.

`node reporting/install.mjs --destination /absolute/versioned/runtime --config /absolute/private/reporting.json
--agent-dir /absolute/Library/LaunchAgents --label example.infra --credential-wrapper /absolute/bin/company-env`
prints a dry-run by default. `--apply` installs an exclusive self-contained package, verifies
its import, preserves the previous plist and writes the new one only while the service is
unloaded. `--rollback --apply` restores the previous plist; old runtime files are retained.
Installation does not load launchd. Only after reviewed source/green CI and explicit rollout,
the operator bootstraps the printed plist path in the existing user's gui domain. Never use
a mutable task checkout as the installed runtime. No reporter is enrolled by this change.

Dispatcher allocations are not current GitHub busy counts; null slots also mean provisioning.
Running VMs are measured independently. Phone lease absence says nothing about readiness.
Persistent identities come only from enrolled `.runner` metadata and its exact GitHub URL/agentId.
The UI joins job repository/runnerId, never names. Organization visibility gaps and unknown
provisioning slots cannot yield zero runner totals. Hardware model/chip/logical cores/macOS version
are observed alongside metrics; invocation task/host/model/effort and elapsed use actual recorded
start/create time (unknown if missing), not a file timestamp fabricated as a launch time.
Shared account and GitHub sources have exactly one registered writer host. Reporter failure
is telemetry failure and cannot block the underlying CI/release/Factory operation.

Check transport parity explicitly before joint source review:
`node reporting/check-contract.mjs /absolute/consumer/apps/web/lib/infrastructure/wire.mjs`.
The consumer records this hash in its private integration documentation; update both copies together.


Owner dispatcher runnerInventory version1 is additive to existing slots and ownership state.
Legacy null slots retain unknown idle/provisioning semantics until a producer reports a complete
inventory. Confirmed IDs, pending registration and uncertain deletion survive in the bounded
observation. A disabled Tart path leaves VM census unknown independently of runner inventory.
Persistent entries may opt into observeListener. Local listener process state is separate from
GitHub registration, online and busy state.

An enrolled phone uses bounded read-only devicectl inventory and lock facts bracketed by lease
and exact identity reads. A held lease is busy and skips the lock read. Disconnection, pairing,
developer mode, tunnel and DDI facts describe host prerequisites. Unlock-since-boot does not
assert current screen unlock. No connection, mount, lease acquisition or device control is issued.


Current Factory observation takes one canonical same-user process census per source. It checks
recorded guardian/worker identities on every terminal path and current unattended markers even
for empty reservations. Historical proof hashes cannot suppress current live evidence. The shared
canonical parser is reused by the existing tracker without changing its signalling/lifecycle API.
Duplicate project entries, runner identities, census rows and invocations are refused at the wire
boundary. Additive phone states are internally consistent while legacy v1 phone payloads remain
accepted. Runner census reads precede optional job sampling within the bounded request budget.
