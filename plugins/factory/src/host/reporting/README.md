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
projectIds, repository/organization scope, eligible roles and labels); phone (leasePath); quota (binding with opaque id,
instanceId, exact numeric accountId, provider, baseUrl; emailEnv/passwordEnv); github (at most
three registered repositories). The company owns real configuration outside Git. Gateway
admin references are resolved only by an existing credential wrapper, never copied into config.

Register default Factory home and every explicitly configured service home. Discover them
from trusted launchd/wrapper metadata, not arbitrary home scans. The steward's runner can
inherit the default Factory home: its config-file directory alone does not establish a state
root. A missing enrolled root is partial, not zero. Quota uses GET account-by-ID stored extra
fields only. Expired windows retain their old values/timestamps; they never become zero.

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
