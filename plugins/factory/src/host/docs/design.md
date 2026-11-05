# Design

Status: imported from the original `morpheus-factory` design (v0, 2026-10-28) into the
optional Factory plugin. It records the reasoning behind the placement/admission/broker core
in `core/`. **Historical:** the Paperclip sections below describe the original planning
context. The current Factory plugin does not use Paperclip; delegation runs through the
plugin's own `factory_*` tools and gateway workers (see the plugin README).

## The problem

Three things are conflated in a single-wrapper-per-machine design:

| Axis | Examples | Should be portable? |
|---|---|---|
| Subscription | Claude Max, ChatGPT/Codex Pro, SuperGrok | Yes, independent of machine |
| Host | Mac Studio, Mac mini, MacBook Pro | No |
| Worker | provider CLI + model + effort + permission + workspace | Bound at run time |

Today's pool binds all three: a profile is `{provider, account, host,
workspace}` and the subscription's login lives on that host. That makes "one
subscription on several machines" and "several subscriptions on one machine"
awkward, and it makes a new machine a re-authentication chore.

Factory splits the decision in two:

```
Paperclip            what runs, and when
   │
factory              where, and on whose capacity      ← this repo
   │   run spec
runner               executes one turn
   │
broker               request → subscription account
```

Paperclip keeps scheduling. The broker keeps credentials and account selection.
Factory is the seam between them, and owns the only durable artifact: the run
spec.

## Why not a custom Paperclip adapter

Paperclip's adapter answers *how one turn is executed* — which CLI, how it is
spawned, how its stream is folded, how a session resumes. Factory answers *where
and on whose capacity*. Those are orthogonal.

A single `morpheus-factory` adapter would force one of two bad outcomes:

- reimplement every provider's CLI driver inside the adapter, duplicating the one
  part Paperclip already does well and that breaks whenever a CLI ships; or
- hide provider identity from the board, so every run looks the same and nobody
  can see which model or permission actually ran.

So the factory registers **one agent per profile** under the existing `process`
adapter, which is already qualified in Morpheus. One binary, many registrations,
no forked adapter contract, and the board keeps per-profile observability.

If Paperclip later needs factory to own the inbound answer channel — the current
co-location constraint on the process adapter — that becomes a second entry point
over the same core, not a rewrite of the selection logic.

## Placement

Placement is pure: request + catalog in, placement or refusal out. Configuration
order is the operator's preference order, so the same inputs always produce the
same host.

Rules:

1. A profile with `hosts` may run only on those hosts. Absent means any.
2. An operator pin is honoured, but never widens eligibility.
3. An unhealthy host is refused, not silently skipped, when it was pinned.
4. "No eligible host" and "every eligible host is down" are distinct refusals:
   the first is a configuration error, the second is a wait.
5. A pinned workspace must sit under one of the host's roots, compared on path
   segment boundaries — `/srv/work/application` is not inside `/srv/work/app`.

## Admission

Admission is separate from placement because the remedies differ: a refusal is a
requeue, a placement failure is an edit.

Gates, in order: broker reachable → group known → a healthy account exists →
quota windows readable → below `stopAtPercent` → a concurrency slot free.

Two boundaries are deliberate and tested:

- **exactly at `stopAtPercent` refuses.** The next turn would cross it, and a
  requeue is cheaper than a rate limit that strands every worker in the group.
- **`inFlight === maxConcurrency` refuses.** A free slot is one that can still
  accept a request.

An unreadable percentage, an empty window set, or a missing group is
`quota-unknown`, never "zero usage". When `requireKnownQuota` is false those
admit, which is only appropriate for `native` deployments where the host's own
quota command remains the execution-time gate. **Concurrency is never waived**:
the slot cap is a hard safety limit and is enforced even when quota is unknown,
so a relaxed quota policy cannot silently admit past it.

## The broker port

```ts
interface BrokerPort {
  readonly id: string;
  snapshot(): Promise<BrokerSnapshot>;   // fail closed, never throw
  auth(profile: Profile): Auth;          // a reference, never a secret
}
```

`CapacityBroker` reads one fleet-wide document:

```
GET {baseUrl}/factory/v1/capacity
{ "observedAt": "<iso8601>",
  "groups": { "<group>": { "inFlight": 0, "maxConcurrency": 5,
                           "healthyAccounts": 2,
                           "windows": [{ "id": "5h", "usedPercent": 12,
                                         "resetsAt": "<iso8601>" }] } } }
```

This is intentionally **not** a sub2api client. The gateway's admin payloads are
version-specific and shaped for its own UI; a broker upgrade must not be able to
break placement. A small adapter publishes this document from the gateway — or
from anything else that can answer the same question.

The capacity origin and the gateway origin are distinct fields
(`baseUrl` vs `gatewayBaseUrl`). A run spec's `auth.baseUrl` is always the
gateway origin, never the capacity endpoint, so a CLI can never be pointed at
the wrong host when the adapter and the gateway live apart.

`NativeBroker` returns no groups. It exists so a broker outage degrades the
fleet instead of stopping it.

## Credential rules

The earlier "no staged credentials" rule was written to prevent raw provider
OAuth being copied onto workers. It is restated here precisely:

1. **Raw provider OAuth never leaves the broker.** Refresh tokens live in one
   database, on one host, backed up as credential material.
2. **Workers receive references**, resolved at spawn time: `env:NAME` or
   `secret:path`. A run spec carries the reference, never the value.
3. **One broker owns a subscription.** A host that also holds a native login for
   a brokered account will rotate the same refresh chain and invalidate the
   broker. Native login is permitted only on hosts explicitly marked
   `nativeLogin`, and only for accounts the broker does not hold.
4. **Staging a gateway key is allowed; staging a subscription token is not.**
   The former is revocable and scoped; the latter is the account.

## Degraded mode

`degradedMode: "native"` permits a run to proceed on a host's own login when the
broker cannot be reached **and** that host opted in. `"refuse"` stops and
requeues.

The spec records which happened: `auth.mode` and `quota.source`. A run that
executed on native capacity is never reported as broker-verified.

Degraded mode does not cover `quota-unknown`. Unproven capacity is a refusal, not
an outage — otherwise the gate quietly disappears whenever a broker misbehaves.

## Risks this design does not remove

- **Emulation is an arms race.** A subscription gateway works by making a
  proxied request look first-party. That is observed behaviour, not a contract,
  and it can break without notice. Mitigation is a daily canary per provider and
  a fast, deliberate upgrade path — not pinning alone, which also pins the
  breakage.
- **The broker is a single point of failure.** Moving it to a cloud host
  relocates it. Degraded mode is the actual mitigation; a second region is not,
  because the refresh chain lives in one database.
- **Terms of service.** Routing subscription traffic through a gateway may
  violate provider terms. That is an operator decision, not a technical one.
- **The database is the credential.** Losing it means re-authenticating every
  subscription.

## Open questions for the spike

1. Do Claude Code, Codex and Grok CLIs complete a real coding session through a
   gateway — tools, streaming, websockets, session affinity?
2. Does the native runner dissolve the process adapter's controller/coordinator
   co-location constraint, and therefore permit deeper agent hierarchies?
3. Which per-account usage can be read reliably enough to feed the capacity
   document, at what latency?
4. Does a broker upgrade preserve the credential chain, and how is that tested
   before rollout?

## What would change this design

- The spike showing a CLI cannot complete a session through the gateway: fall
  back to native login per host and keep factory for placement only.
- Forking the gateway more than once a quarter: that is a signal to own the
  layer, not to keep patching it.
- A provider shipping a documented first-party delegation mechanism: the
  emulation risk disappears and the broker becomes a plain router.

## Host updates — design decisions

The host and fleet controllers (`worker/`, `fleet/`) keep one exact Xcode pin per host in
step with a consumer repository and, on CI-image hosts, a Tart CI image. The pin, paths,
Apple credential *names*, runner and device bindings live in the operator's private host
manifest (`worker/host_config.py`), never in this package.

- *The `phase` gate is an optional hold, not a step an agent flips.* The controller already
  refuses to switch a host before the image is verified, the consumer's main carries the pin
  and the host validation passes. `phase: "stage"` holds a host at staging when an operator
  wants that.
- *Consumer pin PRs are substitutions, not prompts.* The current pin is read from the
  consumer's assertion script on main; every file under the declared pin paths has the old
  version and build replaced, and the PR is opened as a draft under the consumer's normal
  gates. A fresh, time-boxed `codex exec` carries it through only when the draft is still
  open on a later tick, at most three times per pin.
- *Generic persistent runners get a Factory-owned LaunchAgent.* The stock `svc.sh` plist sets
  `SessionCreate`, which locks the login keychain in the runner's session and breaks
  `codesign` with `errSecInternalComponent`. Factory writes its own plist without it. A
  restricted device runner installed elsewhere is only checked.
- *Root actions go through one Apple-signature-checking helper, not a sudoers list of
  commands.* A sudoers grant of `mv`, `rm -rf` or `xcode-select --switch *` is root for any
  process running as the worker user. The host keeps one root-owned helper
  (`worker/xcode-root-helper.sh`, installed once to `/usr/local/libexec/morpheus-factory-xcode`)
  with three verbs. `install` clones the expanded download (`cp -Rc`) into a root-only
  quarantine, makes it root-owned and unwritable, and only then verifies it (`codesign
  --deep --strict` against Xcode's designated requirement, `spctl`, the reported version),
  runs `-license accept` and `-runFirstLaunch` with a clean root environment, and moves it
  into `/Applications`. `select` and `remove` run no bundle code as root.
- *`xcodes` is installed from its pinned, checksummed release binary*, because the Homebrew
  tap builds from source and fails on macOS 27 (XcodesOrg/homebrew-made#4).
- *Retention is one Xcode per host in steady state.* `xcode.retain` defaults to 1; the
  previous app survives only through the migration window. *Validated* is three facts: the
  host selects the pin, the consumer's merged main carries the pin, and the newest completed
  run of `consumer.deliveryWorkflow` on main started after the host's recorded promotion and
  succeeded. Unknown never deletes. Pruning a validated pin also removes a hand-installed
  `/Applications/Xcode.app` the user can delete.
- *Every host serves one CI image for every repository.* A host's one image is
  `ci-xcode-<pin>`, carrying the runtimes in `ci.runtimes`; the host-setup repository's
  `activate-pool.mjs` makes it the host-wide default, so the previous image is unreferenced
  after activation and `retire` removes it through `ci-vm/prune-images.mjs --apply`.
- *Simulator runtimes are explicit and not deleted by Factory.* The builder and verifier
  receive `--runtime <version>` for each listed runtime, the image receipt records the list,
  and `check` reports any listed runtime missing from the host. Retirement removes Xcode apps
  and unreferenced images only.
- *Configuration is private and local; code is installed.* (Migration into the plugin.) The
  manifest moved out of Git to `$FACTORY_HOME/hosts.json` (owner-only), validated by one
  boundary that a later Firestore reader can share. The hourly runner no longer fast-forwards
  its own checkout: code changes arrive by an explicit reinstall, and `install_updates.py`
  keeps the previous LaunchAgent for `--rollback`.
