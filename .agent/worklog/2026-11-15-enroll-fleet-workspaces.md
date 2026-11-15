---
roadmap: MO-26-11-15-01.02.23
tags: [engineering, devops, factory]
---

Implemented the source portion of #707 in the existing claimed checkout, starting at
`804617265a36976b0c5c26cd266f9543ba361d20`. The controller retains independent review,
PR/CI and deployment. No push, PR, enrollment, production change, secret rotation, private
repository operation or live model invocation was performed. The existing live results for
#708 and #710 were supplied as evidence and were not repeated.

The shared `fleet-workspace.mjs` policy/intent boundary authorizes an exact repository set,
profile/sandbox, pinned comparison commits and pinned credential manifest/companion references.
Interactive `cwd`/`repos` selection resolves clean linked checkouts and authorizes each owned
path. Explicit remote and service submissions use the same intent and service authorization.
The normalized digest uses a deterministic project ordering. Stable message IDs cannot change
intent. Related source enrollments must share workspace ownership and compatible selection/slots.

`fleet-workspace-checkout.mjs` verifies protected authority, canonical paths, writable owned
checkouts, exact revisions and scoped credential pointers. The supervisor fetches full source
and comparison ancestry, including migration of a shallow mirror. Each attempt gets isolated
repository directories. A pinned local comparison remote supports ordinary Git fetch/default
branch/merge-base probes while keeping the supervisor's upstream credentials out of the worker.
The controller remains the GitHub delivery surface. Codex workspace-write receives every
explicit writable root; Full Access remains the dedicated OS-account boundary.

Declared credentials use the normal `morpheus credentials run -- <trusted-command>` path.
The executor verifies exact manifest bytes, companion origin and commit, a clean tracked tree,
and an executable protected wrapper. It links only the declared ignored local path to that
operator-provisioned store. Extra references, changed manifests/companion revisions, path
traversal, profile widening and comparison drift refuse. Root-owned companion provisioning
also needs Git safe.directory for that exact path under the authorized account. No secret
values travel in task bindings or credential exports to the worker environment.

The existing settlement journal retains fixed fetch/checkout/invocation diagnostic codes.
Receipts include exact source/policy and selection, and interactive status retains the receipt.
Unattended reporting maps the full writable-root set. Uncertain cleanup still holds the slot
and shared workspace; the existing fresh-census reconciliation behavior remains intact.
Architecture, the operator README and task contract document the policy and qualification.
The retained Mermaid matches the early diagram shown through the worker's progress channel.
No dependency was added: this is domain-specific Fleet policy using existing Zod, Git and Node.

Validation used synthetic repositories, accounts, manifests, wrapper and provider output.
The new fixture runs the real HTTP API with a transaction double, real Git fetch/checkouts,
supervisor/executor protocol, gateway worker, guardian, trusted wrapper, continuation,
report consumer and receipt. Sudo and OS authority observations are fixtures, following the
existing operator-profile test pattern. A real host's account ACLs, Xcode build/cache and
simulator services are not proven by these tests. The README specifies the private host canary
and rollback procedure; heartbeat/quota alone never certifies host capabilities.

Commands and observed results:

- `node --test plugins/factory/tests/fleet-*.test.mjs plugins/factory/tests/unattended-worker.test.mjs plugins/factory/tests/gateway-workers.test.mjs plugins/factory/tests/mcp.test.mjs plugins/factory/tests/release.test.mjs plugins/factory/tests/install.test.mjs` — 95 passed. Scope covers Fleet control/execution, existing single-repo and legacy continuation, gateway permissions, fresh-census reconciliation, deadlines, MCP discovery and installation defaults.
- `node --test plugins/factory/tests/fleet-workspace.test.mjs plugins/factory/tests/mcp.test.mjs` — 17 passed after additional policy-selection and diagnostic tests. It includes exact service receipt diagnostics and current interactive/report consumers.
- `node --test plugins/factory/tests/fleet-workspace.test.mjs` — 9 passed on final source, including executable/clean-companion checks, mutable-wrapper ACL denial, manifest-byte integrity and the stronger mutable-config assertion.
- `pnpm typecheck`, `pnpm compile`, `pnpm morpheus pm index`, `node plugins/factory/scripts/check.mjs`, and `git diff --check` passed. Compile generated no additional tracked output. PM indexes are static/unchanged.
- `morpheus complexity check --base 804617265a36976b0c5c26cd266f9543ba361d20` — passes the enforced CCN limit 15. Three cognitive advisories remain: executor execute 16, executor dispatch 19, gateway bindCheckout 18. These name distinct admission/preparation responsibilities and were inspected by hand; no waiver or exclusion was added.

The first complexity pass of the initial feature found CCN errors in executor prepare (18),
route creation (16), gatewayWorker (16), and companion validation (32). Refactoring separated
checkout binding, additional-route construction, manifest parsing, pointer validation,
protected-wrapper verification and link attachment. Final CCNs are prepare 13, route creation
14, gatewayWorker 9, bindCheckout 11, and companion helpers 7/9/9/6/6/2. The original companion
body measured cognitive 34 and NLOC 43; the final six-function family measures cognitive 32
and NLOC 60, including later executable/clean-tree checks. This compares initial feature code
with final code, not trunk, and is not a claim of behavior equivalence or performance improvement.
Complete before-family NLOC data was not retained, so no invented family-wide delta is reported.

Dead ends and limitations: this fresh checkout initially had no dependencies, so the first
Node run failed module resolution. Root locked install succeeded; plugin install with
`--ignore-workspace` read the wrong overrides, then the supported
`pnpm --dir plugins/factory install --frozen-lockfile` succeeded without changing a lockfile.
The first existing runner assertion rejected the intentionally added deadline diagnostic;
it now asserts that field as part of the result. Morpheus Context MCP successfully resolved
this task checkout, opened governing records and reported README/task-contract Markdown as
uncovered; those documents were read directly. Codebase-memory had no exact-checkout index;
the supported repair did not produce a usable index, and subsequent graph search/coverage
calls failed with `Transport closed`. Exact source and bounded direct reads were used instead;
no complete graph-coverage claim is made. Complexity itself is operational on this checkout
with the explicit starting base; no missing-ancestry waiver was used for implementation.

Pending acceptance: controller inspection and independent review; normal PR and required CI;
operator-approved rollout and actual per-host/profile source/write/build/cache/credential
canaries, retained privately. No unresolved implementation choice requires a human decision.


Targeted mutation checks used `node --test --test-name-pattern <pattern>
plugins/factory/tests/fleet-workspace.test.mjs` with source restoration in a Python `finally`
block. Disabling the exact repository-set comparison failed the authorization assertion;
replacing the writable-wrapper refusal with `return` failed the execution-boundary assertion;
disabling the manifest-byte digest comparison failed the altered-manifest assertion. All
three mutations were rejected and restored; there were no survivors in this bounded sample.
The mutable-wrapper test initially intercepted its own Node fixture launch in the sudo mock;
the mock now passes that explicit Node subprocess through. Preliminary mutation runs with
that fixture failure were discarded; only post-fix assertion failures count above.
