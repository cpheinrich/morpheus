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
