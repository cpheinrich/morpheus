---
roadmap: MO-26-08-05-16.27.56
date: 2026-08-05
summary: Wired the freshness policy to the CLI, the scaffold and CI — the gate lives inside `morpheus` rather than in per-project config, which is what makes it reach every project for free.
---

## The decision that shaped everything else

The obvious rollout is hooks: a `SessionStart` hook per provider, a `pre-commit` hook per repo,
`.claude/settings.json` scaffolded everywhere. That was the wrong first move, and seeing why
changed the whole shape.

**Put the gate inside the `morpheus` CLI.** Every project already shells out to `pm claim`,
`pm new`, `pm block`, `access sync` — those *are* the governed actions the item asks for. Gating
them there makes the check live in all seven registered projects the moment they bump the git
dependency: no files touched in any project, nothing to scaffold, nothing to migrate. Provider
hooks reach one runner each for the same work, which is why they ended up last rather than first.

Ranked by reach per unit of work:

| Surface | Reaches | Per-project work |
|---|---|---|
| The CLI gate | every project, agent and human | none |
| `check pr` | every PR | already centralised |
| `.claude/settings.json` | Claude Code only | one scaffolded file |
| `AGENTS.md` | anything that reads instructions | scaffolded |

## Three things that already fitted

Worth recording because they were luck the next person should not have to re-derive.

- **`CANONICAL_INPUTS` was already right.** `morpheus init` scaffolds exactly `CLAUDE.md`,
  `.agent/decisions.md` and `.agent/learned.md` — the policy's default set. So no project needs a
  required-set config, which is the safest possible answer to acceptance 6: the value that
  switches coverage off is unreachable if almost nobody writes the key. There is now a test
  asserting the fit, because it is load-bearing and looks incidental.
- **The worktree is the session id.** The lease store is keyed by a `sessionId` nothing defined.
  AGENTS.md already mandates one worktree per parallel session, so the worktree path *is* the
  identity — provider-neutral, stable across a resume, and it finally gives `ContextReceipt.worktree`
  the job round 8 of the previous review flagged it as not having.
- **`local/` is gitignored in every scaffolded project**, so `local/sessions/` needed no new rule.

## What the term is actually for

This only became clear building `check`. The five-minute term is **how often the network is
consulted**, not a countdown to a re-read. Inside it the last observation stands and the check
costs one file read; past it, the stored *receipt* is re-observed against `ls-remote` and the
records as they are now.

Re-reading the persisted *verdict* would have been the obvious implementation and is exactly the
bug the item opens with — a lease that was fresh at 12:05 answering for 18:00. The receipt is what
persists; the verdict is recomputed.

`git ls-remote origin main` rather than `rev-parse origin/main`, which reads a local ref only as
current as the last fetch. That is the looks-checked-is-not shape, one layer down.

## The thing a guard must not do

**Taking a receipt has to be a command, never a side effect.** The tempting design is a
`SessionStart` hook that runs `context refresh`, so every session starts fresh. It certifies that
the records were read by the act of not reading them — the receipt is an assertion, and an
assertion made on the agent's behalf is worthless.

So the Claude hook runs `context brief`, which prints what is missing and takes nothing. It exits 0
**by design rather than by `|| true`**: a hook written `morpheus context status || true` swallows a
missing binary exactly the way it swallows a stale lease, which is the sentinel rule in
`.agent/learned.md` wearing a shell costume.

`context refresh` prints what landed on the trunk and which records moved, so the command that
certifies is also the command that tells you what you missed. That does not close the hole — an
agent can still refresh without reading — but it removes the excuse, and AGENTS.md names it as the
one failure the protocol cannot detect.

## Gate fatigue is the real risk, so four commands and no more

`pm claim`, `pm new`, `pm block`, `access sync`. Not `pm index`, `pm validate`, `pm ship`,
`check pr`, `heartbeat`, `doctor`.

A gate that fires on read-only and mechanical commands trains people to route around it, and **the
routing-around is permanent where the staleness was temporary**. The four chosen are the ones where
acting on stale context does identifiable harm: claiming work you would not claim knowing what
merged, filing an item that already exists, escalating a question the inbox answered, granting from
an allowlist that has moved.

Same reason git hooks were dropped entirely. A human typing `git commit` has no session and cannot
have one, so a `pre-commit` hook is either agent-only — needing detection that does not exist — or
a thing humans learn to `--no-verify` past. The CLI gate already covers the actions that matter.

## CI can only answer half the question

A receipt is local and gitignored, so **no workflow can validate one.** It is one machine's
observation by construction; acceptance 5 as originally written was unbuildable, not merely
unbuilt.

What CI can see is whether the canonical records moved on the base branch while a PR was open,
which is the same freshness question from outside. `check pr` reports it as `context-drift`, at
warning level: a moving trunk is nobody's mistake, and blocking would fail PRs for something
outside the author's control at write time. Refusal belongs at the local gate; visibility belongs
in CI.

## One test caught me making the branch's own mistake

The first version of the "never resolves to an empty set" test asserted
`expect(requiredInputs ?? []).not.toEqual([])` — which collapses `undefined` into `[]` and so
cannot distinguish *none declared* from *declared as none*. That is the sentinel rule from
`.agent/learned.md`, in an assertion, written by the person who wrote the rule, one file over.

Sixth instance. The rule holds and so does the correction to it: state it as a question at every
boundary, not as a fact about one shape.

## What review found, and the shape it shared

Five findings, and four of them were one thing again: **a fix landed on one of two outputs.**

- **The offline exception discarded the half of the lease that is knowable offline.**
  `observeLease` returns `unknown` unconditionally for an unreachable remote *and still fills in
  the local delta* — that is what `localDelta` is documented for. The gate threw it away and
  printed a reassurance. Offline covers **an unverifiable trunk, not records you can read right
  now and have not**, which is the only reading under which the exception is safe.
- **`refresh` printed ✓ and exited 0 for a receipt that never reached disk.** `check` twelve lines
  down handled it; `refresh`, whose entire job is to write the lease, folded a filesystem failure
  into the same channel as "dropped an advisory label". The loop that produces is the one
  `unresolvableInputs` exists to prevent, arriving through the store instead of the inputs.
  `ContextResult` now carries `written` separately from `issue`.
- **`asStrings` collapsed a malformed declaration into `[]`.** A project writing
  `requiredInputs: [{path: "x.md"}]` — trying to *add* records — got coverage switched off. The
  empty branch now gates on the raw array, because declared-and-nothing-usable is not
  declared-as-none.
- **The scaffolded hook could not run in a scaffolded project.** `pnpm --silent morpheus` in a
  repo `init` never gives a `package.json`. Worse, `doctor` stat'd the file and reported adoption,
  so the hook read as present in exactly the projects where it did nothing. Bare `morpheus context
  brief` now, and `doctor` reads the file rather than stat'ing it.
- Acceptance 7 was half-done: `leaseAt` took the default policy while `observeLease` took the
  project's. Harmless while nothing sets `ttlMs`, and precisely the trap 7 asked to be closed.

The fixture for the offline tests failed first time for a good reason worth recording: it wrote a
lease without creating the records on disk, and `gate` **re-observes**. A synthetic lease measures
nothing here. Fixtures for this module have to be grounded on a real tree.

## Second review pass — two that would have shipped broken

- **A scaffolded `internal` project would have had a permanently closed gate.** `manifest()`
  declares `context.handle` for every kind; `init` wrote `hq/team/<owner>.md` only when the kind's
  directory list included `hq/team`, which `internal` does not. The record then reads `ABSENT` →
  unresolvable → `refresh_required` forever, with **no escape**: offline does not help (the delta
  is knowable locally), and `requiredInputs: []` does not either, because the handle is what put it
  there. **A declared record that is never created is the worst shape this protocol has**, and the
  new scaffolding test walked past it by testing `company` — the one kind that happened to work.
  Tests over all three kinds now, and `doctor` reports a handle without its file as an *error*.
- **`context-drift` could never fire in CI.** `HEAD...base` on `pull_request` compares
  `refs/pull/N/merge` — whose first parent *is* the base tip — so the merge-base is the base and
  the diff is empty every time. It would have reported a clean trunk forever and looked like it
  was working, which is the whole acceptance-5 substitution silently doing nothing. The fork point
  has to come from the PR *head* (`HEAD^2` on a merge ref). The pure function had tests; its only
  producer had none, which is exactly where the bug was.

Two more, both the same one-of-two-outputs shape:

- `refresh` reported record drift from `before.lease.changedInputs`, and a stored lease inside its
  term comes back unmodified with `changedInputs: []` by construction. So a refresh within five
  minutes of the last one silently re-certified whatever moved during the term — you end up
  holding a receipt asserting you read content you have not seen. It compares receipt to receipt
  now, the way the trunk half always did.
- `context brief` — which *is* the hook, and the first thing an agent reads — flattened
  `unresolvableInputs` into the changed list and closed with "run refresh". The one instruction
  that cannot fix them.

## Third review pass — the lock-out shape has layers

- **`ls-remote` exits 0 with empty output when no ref matches.** So *"origin has no `main`"* and
  *"the network is down"* rode one `null` channel, and the whole `fresh` verdict turns on that
  field. A repo whose default branch is `master`, or whose remote is `upstream`, was permanently
  `unknown` — `pm claim` and `access sync` refused forever, with a message telling the operator to
  check their connection. **The same shape as a handle whose inbox is never created, one layer
  down: a declared thing that does not exist, failing closed with a misleading reason.**
  `--exit-code` separates them, and `doctor` now has somewhere to point.
- **`origin` is not the canonical trunk on a fork** — AGENTS.md says so explicitly, in the section
  on id allocation, and I hardcoded it anyway. A fork's `main` sits still while the real trunk
  moves, so the lease certifies `fresh` indefinitely: the exact state the protocol exists to
  refuse, arriving with a ✓. `context.trunk` declares it; undeclared, `origin/HEAD` is asked first.
  **Worth noting the pattern in the miss:** the answer was already written down in the repo's own
  instructions, in a section about something else.
- **A gated command invalidated the lease that let it run.** `pm block` writes the owner's inbox,
  which the required set names, so the second `pm block` past the term was refused for drift this
  session authored — naming a file it wrote a minute earlier. The everyday inbox cycle is worse:
  read replies, promote to `decisions.md`, archive, rewrite the inbox, and three of four canonical
  records have moved by your own hand.

  Nothing unsafe, and that is the problem. **Refusals with no informational content are the fastest
  route to a gate being routed around**, and they are exactly where "do not refresh without
  reading" stops being holdable — there is nothing to read, so the habit that forms is *refresh to
  clear the gate*, which the docs correctly name as the one failure this cannot detect. `noteWrite`
  re-fingerprints only the records the caller wrote and only those the receipt already covered, so
  the assertion stays **true** rather than being re-asserted blindly.

## Left open, deliberately

- **Codex has no adapter.** `SessionAdapter` has `requestRefresh` and `requestRepair`; steering and
  interruption have no channel, and nothing in this branch reaches the app-server. Codex reads
  `AGENTS.md`, so it is instructed but not hooked — and the CLI gate covers it regardless, which is
  the argument for having put the gate there.
- **`written: false` is not acted on by any caller yet.** `check` carries it out as an `issue` and
  the CLI prints it; nothing refuses on it. It is the module's one fail-open path.
- **Five minutes is still unmeasured.** Cheap enough not to matter — one `ls-remote` and four file
  hashes — so the question is fatigue, not cost, and that needs a week of real sessions.
- **Existing projects need `context.handle` added by hand.** `init` never overwrites, so a re-run
  scaffolds `.claude/settings.json` but leaves `morpheus.json` alone. `doctor` now reports both as
  warnings, which is the adoption signal.
