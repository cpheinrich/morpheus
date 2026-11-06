---
roadmap: MO-26-11-06-13.51.37
date: 2026-11-06
agent: codex
tags: [engineering, devops, storage]
---
# Worker storage and CI capacity — source ready

## Mandate and limits

Directly assigned DevOps work: audit actual disk use, improve supported cleanup, prepare a
one-VM 8-vCPU / 16384-MiB host with two native Xcode workers, and preserve the other host's
two 6-vCPU / 16384-MiB VMs. Use existing authorized gateway capacity only, no paid API,
overage or new services. Preserve live jobs, credentials, sessions, source, receipts,
Hermes and gateway/controller state. No upload, Apple operation or sending. No recursive
delegation. The supervisor owns independent review; stop before merge/install and report
`SOURCE_READY_FOR_REVIEW`. Supervision is about once per minute with material failures
reported immediately; two unchanged failures trigger a different diagnostic approach.

## Findings and design

Measured free space was 50.9 GiB on a 460.4-GiB volume (floor 70, target 100).
DerivedData was empty, the SwiftPM cache was 1.59 GiB, and the Spotlight store was 2.9 GiB:
relaxing global build guards would reclaim nothing in these categories. Preserve them.
Normal simulator devices and the warmed template account for the host simulator data;
they remain owned. Claude's roughly 12-GiB support tree is mostly VM bundles, not cache.
Controller/recovery support, repository worktrees, code indexes, runtimes, sessions,
Playwright and running Colima are protected. Old-worktree dry-run refusals were retained;
ten candidates could not establish cleanup proof because their remote fetches failed.

The major eligible candidates are two stopped, unreferenced CI images (103.7 GiB combined
allocated accounting) and five obsolete CI cache disks after the slot reduction
(27,709,468,672 bytes, 25.81 GiB). Configured slot-0 disks remain warm. Shared APFS blocks
mean neither figure guarantees reclaimed bytes. Actual free-space delta is acceptance.
Brave's OS cache is 741,720 KiB and Codex's is 173,672 KiB; both apps were closed. Extend
only these OS cache roots, leaving all Application Support profiles/session/VM data alone.

Morpheus remains the cleanup owner; `agent-host-setup` owns Tart. Its new offline cache
pruner imports the dispatcher's exact cache path, keeps mountable disks, requires an unloaded
dispatcher/no running VM and closed-file proof, and rechecks config/file identity. It creates
no schedule, stops nothing and treats unknown inspection as refusal. No generic module or
dependency is appropriate: this is a small dispatcher-specific disk ownership contract.

The host-setup Factory checkout began at a stale, divergent local commit. Its original three
Linux commits remain preserved in Git; the task branch starts at fetched reviewed trunk
1282e6090725. No original checkout was changed. The installed cleanup predates operator-owned
simulator prefixes; rollout must migrate its old prefixes/namespaces into the private operator
config before installing canonical source. Its installed dispatcher also predates host lanes.

## Validation

- `python3 -m unittest discover -s plugins/factory/src/host/tests -p test_cleanup_development_cache.py`
  — 23 passed, including cache preservation/idempotence, invalid inputs and result boundaries.
- `python3 -m unittest discover -s plugins/factory/src/host/tests -p test_worker_setup.py`
  and `... -p test_cleanup_old_worktrees.py` — 3 + 3 passed, direct installer/ownership dependents.
- `pnpm exec vitest run tests/factory-distribution.test.ts` — 4 passed.
- `pnpm typecheck`, `pnpm compile`, `pnpm morpheus pm index` — passed; generated output unchanged.
- Host-setup: `node --test ci-vm/dispatcher.test.mjs ci-vm/prune-images.test.mjs ci-vm/prune-caches.test.mjs`
  — 53 passed. `python3 -m unittest discover -s ci-vm -p 'test_*.py' -v` — 30 passed.
  Shell syntax checks for installer/build/provision/verify/setup/node scripts passed.
- Both `morpheus complexity check` reports pass the CCN limit 15. Host setup has no warnings.
  Cleanup keeps a cognitive warning in `main` (19). Following the canonical prompt, separated
  argument parsing/validation and result reporting from execution without changing stage order,
  locks, exit codes or thresholds. Before-refactor main CCN/cognitive/NLOC: 27/31/112; after:
  main 15/19/73, parser 2/1/22, validation 8/5/10, report 5/6/14. Complete family totals:
  27/31/112 -> 30/31/119, three coherent helpers; browser helper 1/0/10 on both sides.
  Analyzer pin b57041bf0ea2. Cognitive complexity is advisory; no exclusion or raised limit.
  Source and final reports are retained in the ignored handoff.
- First cache-pruner test run: 52/53 passed; the invalid-owner fixture exposed that `..` was
  accepted as a repository owner. The input grammar now requires an alphanumeric first
  character. Final tests pass, including actual macOS lsof open/closed behavior. No weakened
  assertion, repeated unchanged failure or full root suite.

Graph tools are unavailable in this worker; exact source checks supplement the parent's
generation/coverage evidence. Supported bootstrap installed an exact-checkout index locally;
tools need a session restart to become callable. Required records were read; oversized output
was not credited by the hook, so the receipt explicitly certifies by assertion.

## Remaining acceptance

Independent review of both repository diffs, review records and protected CI/merge are pending.
No remote source/config/service was installed or changed and no cache/image was removed.
Remote work was inventory and installed-script dry run; Hermes PID remained unchanged.
The private rollout packet contains exact paths, byte counts, backup/cutover/verification
commands and rollback. The current consumer manual workflow has no exclusive-host selector;
supervisor must choose an authorized routing mechanism before dispatch, or attest actual Mini
assignment from provider evidence without claiming forced placement. A CI success, actual
two-worker proof, free-space delta and service health are still owed. The item stays in review.

## Continued source preparation — supersedes the routing gap above

The supervisor extended the owned checkout map to Evo and clarified qualification acceptance:
normal all-unit CI is sufficient, with an exclusive Mini label, actual 8-vCPU/16-GiB guest,
host lanes 2 and native YES/max2. Report observed worker count; no full suite or scope override
to force two clones. Evo EV-26-11-06-14.05.11 implements the optional manual runner label and
corrects current serial-only guidance. PR routing, hosted recovery, selection, pre-test/evidence
pins and read-only permissions stay unchanged. The routing gap above is resolved.

Reliability integration stays at the existing owner boundary: host-setup install.sh attempts
the same cache retirement after unloading admission, before restarting. Active VMs or uncertain
ownership defer cleanup with a message and never block adoption/startup. The installer fixture
proves ordering and a refused prune followed by successful startup (6 service tests pass).
No new schedule/state or auto-stop mechanism. Images stay explicit until replacement
qualification removes the rollback need; the general hourly watchdog still does not own Tart.

Morpheus trunk advanced to 5c76acac (visual guidance), then 93ecbae1 (reviewed complexity
baseline). Both were merged, not rebased. Resolved the record-only conflict by preserving both
entries. For the cleanup conflict, kept the full reviewed trunk refactor and reapplied only the
browser-cache helper/stage. This supersedes this branch's earlier argument/result extraction
and metrics: final production diff against 93ecbae1 is only the browser-cache addition.
Adapted result/boundary tests to canonical main. All 23 cleanup tests pass; final complexity
passes without findings. No alternate refactor or policy weakening remains.

Evo's 18 focused workflow/pipeline/reference tests and actionlint pass. Its complexity check
passes enforce CCN 15. No native suite locally because no app code changed. Supported
codebase-memory bootstrap on Evo could not verify an exact-checkout index; known YAML/test
paths were read directly with no graph-completeness claim. The stale local CLI was updated
through supported self-update. No Mini/Studio config/service/source mutation or deletion,
manual CI dispatch, upload or Apple action. Fresh independent review per PR remains root-owned.

## Independent review turn 1 — blocked on M634-001

Root relayed the initial independent review by Factory review f09c35d0-d672-4189-8752-5bdd42a6ac5a,
native session 01a1b2ef-32de-7e20-9ea2-8abf940a0fbc, against reviewed 8835797f and base 93ecbae1.
M634-001 is substantive: a symlink at BraveSoftware or an ancestor can redirect a closed-app
cache sweep into Application Support and delete the browser profile. The reviewer reproduced
the attempted deletion safely. The initial verdict remains blocked; no conditional clearance
was given. Root retains the measured turn duration and will supply it for the structured
review record; no elapsed time or clearance is invented here.

Response prepared for the same reviewer's follow-up: normalize the actual cache path lexically,
require it strictly below HOME, then lstat every component from that path through HOME and
refuse symlinks before iterating its contents. Inspections above HOME are intentionally excluded,
so a macOS /var alias or another alias above a fixture home does not create a false refusal.
Inspection errors propagate to the existing stage failure handling, before deletion. The
closed-app guard and fixed cache allowlist remain unchanged. Host and Evo source untouched.

New temporary-fixture regressions reproduced four failures before the fix (three profile
aliases and an outside-HOME root). Final 26 cleanup tests pass: profile bytes survive a link
at the root, Caches, Library and final cache child; HOME itself and outside paths stay; an
explicit alias above HOME still permits ordinary cache deletion and preserves profile state.
Existing running-app and normal closed-cache deletion checks remain. Before/after logs are
in the private handoff. git diff --check passes. Complexity passes advisory at CCN 15; the
existing cache helper's cognitive 19 is unchanged from the saved pre-fix metrics and now
reported because the helper is touched. No policy/exclusion change or optional refactor.

M634-001 is addressed by the author but requires reviewer verification before disposition as
resolved or clearance. No merge, label, host install/change/deletion or manual dispatch.
