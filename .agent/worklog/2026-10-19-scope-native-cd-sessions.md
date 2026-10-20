---
roadmap: MO-26-10-19-23.45.07
---

# Host-scoped native CD repair

Chris explicitly rejected an Anthropic-support dependency and authorized native
Codex workers on both Macs using the existing GitHub queue/CI. This source task
implements the small reusable boundary; root owns consumer migration, rendered
host/credential/CLI readiness, activation and actual interrupted-host failover.
No host, service, live ledger or real repair was changed here.

Claimed a separate task. Trunk advanced while the first prepared checkout was
being certified, so context correctly refused it. A second fresh prepared checkout
contains actual merged PR431, cc0e0e77516674c511daa7c6cdb72b0a6ce8ec8a; the
first unclaimed checkout was preserved. Read the changed external-distribution
decision, refreshed and claimed in the new checkout before implementation. The
intake baseSha remains its actual historical d8ab2ee source. All new optional
external fields from 431 are retained.

Tier2 graph evidence: project Users-chrisheinrich-code-morpheus, ready generation
2026-10-20T06:23:43Z. Found configSchema 23–43, AgentWork 74–77,
scheduleHosted 94–128 and runWorker 145–233; inbound runWorker points to cd CLI.
Relevant schema/worker/CLI/controller/worker-template and worker-test paths had
metadata_match/no recorded issue (best effort). A guessed config-test path was
missing, so existing fixture/state tests and exact source were inspected instead.
Shell/config/private evidence used direct source reads. No exhaustive graph claim.

`agents.hosted` is optional without adding any defaults. Its scheduler returns
before reading the ledger or touching provider APIs when absent; an explicitly
requested unconfigured executor still fails before ledger access. A pinned test
compares configured-hosted canonical digest and normalized JSON bytes against
actual pre-change 431 dist. Existing hosted prompt/resume behavior is preserved.

Local invocations record hostId. CLI `--host-id` lets operators pin a distinct
stable Mac/user/session-store identifier; old callers use native hostname(). Only
the latest local invocation can resume, and only for the same identified host and
an existing session. A foreign, legacy unidentified or sessionless latest record
starts fresh, even if an older same-host session exists. Fresh native prompts
carry immutable task, original diagnostics and prior durable result/evidence.
There is no session/auth-store copying or new config/digest field for identity.

The existing completion fence was not enough: its catch path checked owner only,
and session checkpoint writes had no ownership fence. Both now verify owner plus
fence. The global local reservation, quota admission and process guardian remain
unchanged. Tests drive real runWorker/CLI/process lifecycle with a synthetic agent
and the existing Git database fake, including a stale fence with the same owner
so the error fallback cannot overwrite a replacement claim. No helper-only test
stands in for those failure paths. No actual model or paid fallback is invoked.

Reused the existing schema, Node hostname, CLI parser and Git CAS; no generic
module or new dependency was introduced. Frozen-lockfile installation disabled
lifecycle scripts. The first focused run passed 40 tests but typecheck caught an
optional-reference narrowing issue; corrected the explicit guard before further
validation. Later focused runs include CLI forwarding and unchanged configured
hosted resume. Final focused scope, mutation evidence and review are appended
after actual completion; no full-repository suite is claimed locally.


## Completed author validation

Final `pnpm exec vitest run tests/cd` passed 156 tests across 9 files, including 15
new native-worker tests. `pnpm typecheck`, `pnpm compile`,
`pnpm morpheus pm index` and `git diff --check` passed. This is the focused CD
subsystem and direct dependents, not the full repository suite. Existing hosted
quota/dispatch, external distribution, controller, state and macOS wrapper tests
remain green. Configured-hosted baseline digest is
fe556465e201db5a95d170bc71f4b4c78840194559eabe8aea2a672e9144e89d;
SHA-256 of its normalized JSON bytes is
4a967d4aab2254eb628d51213c6173099004f0bcea46c05ed76c1588e591bcbb.

Four intended source mutants were killed by actual executed tests: removing the
host match resumed foreign/legacy sessions; allowing a missing-hosted scheduler
read the uninitialized ledger; removing session fencing persisted a stale session;
removing error-fallback fencing incorrectly resolved the stale worker. Mutant
logs and assertions were inspected; all failures corresponded to their intended
behavior. Source was restored in a finally block and its SHA-256 matched the
pre-mutation source exactly. No full unchanged suite rerun was used as a retry.

The original host supervisor/template source is unchanged; consumers can append
an explicit host ID in their separately reviewed rendered worker command. This
PR does not prove either Mac's real ABI or real interrupted-host recovery, and
no activation or live state migration is authorized by its test results.


## Late actual-provider admission correction

The initial independent review cleared f192a854674de76e8514e01ae6ca3812129d84e8
with no findings. After that turn, a separate read-only operator probe exposed an
acceptance risk the reviewer had not tested: native rate-limit windows can be
low while prepaid credits are available, and the parser ignored the actual
ordinaryUsageAllowed boolean. Both actual installed CLI versions 0.154 and 0.163
returned that field. This does not establish live worker acceptance; it supplies
the missing provider contract for our existing no-paid-fallback requirement.

As a focused late correction within that original requirement, native codexQuota
now rejects anything except explicit boolean true before producing a snapshot.
Admission and every native meter read share that function. False, absent, null
and string values reject even with zero usage and prepaid credits; actual worker
tests prove false/absent cannot claim work and stop an already owned synthetic
process when allowance changes. Existing explicit telemetry-file attestations,
configured hosted behavior, normalized config and digest remain unchanged. No
provider/account/auth-store or live host/ledger mutation was performed. The same
independent reviewer receives this fix as its first ordinary follow-up, preserving
the initial clean result and actual invocation timing.


After this correction, focused `pnpm exec vitest run tests/cd` passed 165 tests
across 9 files (24 native-worker tests); the native/worker pair passed 51. Typecheck,
compile, PM index and diff whitespace checks passed. Removing the new ordinary
allowance guard made all four parser rejection assertions and both actual
admission assertions fail for the expected incorrectly admitted result; the two
process-stop mutants additionally reached the test deadline. Only assertion
failures, not deadline failures, establish the mutant kill. The source was
restored byte-for-byte in finally and compiled again after restoration so no
mutated generated output is retained. The broader focused rerun follows a real
source correction, not an unchanged retry.
