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

## Fourth review pass — the reach table was wrong about its own commands

- **`pm block` is classified `external` now, because it pushes.** `block()` ends in
  `commitRecords` — add, commit, **push** — and exists so a block is visible to other sessions,
  which is the definition of leaving the machine. Classified `local`, the offline branch printed
  *"proceeding with pm block because it stays on this machine"* and then pushed to the shared
  inbox. **A message asserting the opposite of what happens, through the one door the exception
  opens**, against an invariant `architecture.md` states flatly. `pm new` is the only genuinely
  local one: its remote use is a read-only `ls-remote` for id allocation.
- **`noteWrite` was called unconditionally and with more than was written.** A `pm block` that
  failed for a missing `--needs` wrote nothing and still re-fingerprinted the inbox, silently
  clearing drift the session never read; and it was handed every required `hq/team/` path where
  `block` writes exactly one, so a second declared inbox got asserted as read by a session that
  neither read nor wrote it. `block` now returns `{ code, written }`, and the caller passes exactly
  that. **The doc comment already said "deliberately narrow — only the named ids, and only from the
  caller that did the writing"; the call site had widened it twice within one commit.**
- **`doctor` now does what AGENTS.md said it did.** The docs promised a trunk check; `grep trunk
  src/doctor/` returned nothing. Two checks: a declared trunk that does not resolve is an *error*
  (every observation `unknown`, external commands refused, message blaming the network), and an
  *undeclared* trunk in a repo with remotes besides `origin` is a warning — the fork case, which is
  the quiet one, because it certifies fresh forever with a ✓ and `doctor` is the only place it can
  be caught.

Path handling caught in passing: `block` returns absolute paths and receipt ids are
worktree-relative, so `noteWrite` matched nothing and was a **silent no-op** — the failure mode
that looks exactly like success. Relativised.

## Fifth review pass — the blunt fix was the wrong one

Round four reclassified `pm block` as `external` because it pushes. Correct diagnosis, blunt
remedy: **AGENTS.md tells an agent facing real ambiguity to block rather than guess**, and refusing
that offline leaves guessing or stopping, for exactly the session that most needs the third option.

The split was available and cheap the whole time. `pm block` is `local` again *conditionally*:
offline it writes the item, the worklog and the inbox entry and **skips the push**, saying the
block is on disk and not yet visible. Acceptance 2 is satisfied on its own terms — local work
proceeds, nothing leaves the machine — and the classification is true rather than asserted.

Worth generalising: **when a command's reach depends on what it does, change what it does rather
than relabelling it.** Two rounds were spent moving `pm block` between columns when neither column
described it.

Two more in the check added last round, both the same lock-out shape it was written to catch:

- **A repo with no remote at all got no finding.** The fork warning was gated on there being
  *other* remotes, and `ls-remote origin main` in a repo with no `origin` exits **128, not 2** — so
  `trunkSha` says `unreachable` and the `missing` branch never runs. That is the *freshly
  scaffolded* state, before `git remote add`: every observation `unknown`, both external commands
  refused permanently with no override, and `doctor` giving it a clean bill of health. Answered
  locally now, from `git remote`, needing no network at all.
- **`doctor` gained a network call and was the one command ignoring the offline declaration.**
  `DoctorOptions.offline` existed and `checkTrunk` respected it; nothing set it. `doctor --all` on
  a plane would have blocked on seven 15-second `ls-remote` timeouts with `MORPHEUS_OFFLINE=1`
  exported and doing nothing.

## Sixth review pass — a declaration is not an observation

The `pm block` split from round five introduced the inverse of the bug it fixed.
`push: !offlineDeclared(flags.offline)` read the **declaration** where every other consumer reads
an **observation**: `gate()` checks `lease.status` first and consults `offlineDeclared` only inside
`if (status === "unknown" && …)`, so a fresh lease returns before the offline branch ever runs.

The env var exists *because hooks and wrappers set environment rather than argv* — the module's own
comment — which is precisely what makes it sticky. Exported once, network back, lease fresh:
`pm claim` pushes fine, and `pm block` writes its records, prints *"Offline: written to disk and
not pushed"*, and exits 0. **The one command whose purpose is visibility silently stops being
visible, in a session where nothing else is degraded, with a message asserting a false premise.**

`GateResult.contained` is now set only when the offline branch is actually taken, threaded out
through `guard`, and that is what `push` reads. The rule to carry: **a declaration is a modifier on
an observation, never a substitute for one.**

Two more:

- **`doctor --offline` printed `✓ No drift.` for a project whose trunk it had not checked.** A
  skipped check reported as nothing is a skipped check reported as a pass, and `doctor` is the
  adoption reporter, so it is the one surface where that difference has to survive. The
  `.claude/settings.json` check two blocks up is *read* rather than stat'd for exactly this reason,
  which is the argument being applied inconsistently within one function.
- **The offline `pm block` had no completion path.** *"Commit and push it when you reconnect"* is an
  instruction with no command behind it: `commitRecords` has one caller, `pm unblock` leaves the
  inbox alone, and `noteWrite` correctly re-fingerprints the receipt — so the only trace of an
  escalation that never reached anyone was a yellow line already scrolled past. `pm claims` now
  reports blocked items whose records are still only in the working tree, matched by id so an
  unrelated dirty file is not misreported.

## Seventh review pass — the completion path pointed at the wrong files

The check added in round six to make a dropped escalation visible **named the one record that
carries no information to the human, and omitted the two that do.** `pm block` writes three files;
the matcher used `path.includes(id)` with the uppercase roadmap id, so:

| Record | Matched |
|---|---|
| `hq/product/roadmap/MO-….md` | yes — and it tells the human nothing |
| `.agent/worklog/…-mo-….md` | no — `block` lowercases the id |
| `hq/team/<owner>.md` | no — **the escalation itself**, and its path has no id at all |

Following the printed *"commit and push so it reaches whoever answers"* literally left the `❗` in
the working tree, and the next `pm claims` found nothing dirty matching any blocked id and
**reported clean — using its own instruction as the mechanism.** Now case-insensitive, and
`hq/team/` is included wholesale: a dirty inbox during a block is the thing you want named either
way.

Two more, both routes to the same invisible state:

- **A failed push after a successful commit leaves a clean working tree**, so a working-tree check
  is structurally unable to see it — and `commitRecords` wrapped add/commit/push in one `try`, so
  the message said *"Committed nothing"* when it had committed. That is the commonest route, and it
  happens *by accident* rather than by declaration. Separate `try` blocks now, and the check reads
  `@{u}..HEAD` as well as `status`.
- **`git status --porcelain` collapses an untracked directory to one entry.** A first block in a
  fresh checkout reported `hq/` and named none of the three records. `-uall`.

And one in the gate: **a trunk ref that does not exist is a configuration error wearing an
`unknown` lease.** Contained by the offline exception, it made `pm block` quietly stop pushing on a
fully online machine and answered a misconfiguration with *"reconnect"*. Checked before the offline
branch now, with its own message.

## Eighth review pass — the same two-dot mistake, two rounds later

`git diff @{u}..HEAD` is **tree-to-tree**, not "commits in HEAD and not upstream". So a branch
merely *behind* reported every upstream file as *"the escalation is on this machine only"* — the
inverse of the truth, in the state you are in after any merged PR you have not pulled, and
`listClaims` fetches immediately before this runs, which makes it the ordinary case rather than
the unlikely one. The printed instruction could not clear it, so it repeated on every run.

**This is the identical defect `trunkChanges` was fixed for two rounds earlier**, written by the
same hand, in the same file, days apart. The lesson is not "remember three dots" — it is that
`A..B` and `A...B` mean *opposite things* between `diff` and `log`, so the safe move is to say what
you mean with the command that has one meaning: `git log --name-only @{u}..HEAD`.

Two more:

- **No upstream returned `[]`.** `git push` failing for want of an upstream is a route into the new
  "committed, but the push failed — `pm claims` will keep saying so" message, and it is exactly
  the case where the range query answers nothing. A promise made by one part of the commit,
  unkeepable by another, in the absence-renders-as-nothing-to-do shape.
- **`hq/team/` wholesale was a standing condition, not "during a block".** Blocked items sit for
  days by design, so any inbox cycle — which AGENTS.md mandates at the end of *every* session —
  was reported as a dropped escalation, with an instruction to commit and push it onto whatever
  branch you were on, which AGENTS.md explicitly forbids for a cycle. The inbox entry is still the
  escalation and its path has no id, so it is matched **by content**: `appendOpenItem` writes the
  roadmap id into the entry as a link, which is the thing the path cannot carry.

## Ninth review pass — the fix arrived through the mechanism that fixed it

`git status --porcelain` and `git log --name-only` emit **repo-root-relative** paths whatever
directory they run in, and the inbox content-read joined them onto `process.cwd()`. From any
subdirectory that read went ENOENT, `.catch(() => "")` turned it into *"names no blocked id"*, and
**the one record that is the escalation dropped out of the report while the two that carry no
information to the human survived by path** — with the instruction still saying *"including the
inbox entry"*.

That is the previous round's finding, arriving through the mechanism written to close it. Two
lessons, and the second is the durable one:

1. Resolve the repo root once (`rev-parse --show-toplevel`) before joining anything git printed.
   `src/session/context.ts` normalises to `worktreeRoot` for exactly this reason, in the same
   commit family; this helper never did.
2. **`.catch(() => "")` is the sentinel rule in punctuation.** An unreadable file and a file that
   says nothing are different answers, and folding them into an empty string is *absence rendering
   as clean* on the one file the whole check exists for. It now lists an unreadable inbox rather
   than dropping it — failing closed is the only safe direction here.

Also: the no-upstream detection reported four different failures as "no upstream" — not a repo, git
missing, a timeout, and the real thing. A confident answer built from a failed lookup. It asks
`--is-inside-work-tree` first now.

## Tenth review pass — three shapes, and one of them had a better question

- **`refresh`'s log block had the root-vs-cwd defect the previous commit fixed one file over.**
  `projectPolicy(process.cwd())` reads `join(root, "morpheus.json")` and returns `{}` on failure,
  so from a subdirectory `context.trunk` was silently dropped: the receipt was taken against the
  declared trunk while the log block resolved `origin/HEAD`, fetched the wrong remote, and asked
  for objects it had not brought. The *"Landed on main"* section simply vanished, leaving output
  that looked complete.
- **`gitLines` mapped every failure to `[]`**, so *"this repo has no git remotes"* — an **error**,
  counted into the exit code — also fired for a non-repo, git missing from PATH, a timeout, and
  git's `dubious ownership` refusal in a container. `git remote` exits 0 with empty stdout in a
  real repo with no remotes, so the two were always cheaply separable.
- **The no-upstream special case had a better question underneath it.** `@{u}..HEAD` answers
  "unpushed relative to the tracking ref", which is wrong twice: nothing on a branch with no
  upstream, and *everything* on a fresh branch whose records were pushed from `main` long ago.
  `git log HEAD --not --remotes` — **reachable from no remote at all** — is the question actually
  being asked, needs no upstream, and deleted the entire `noUpstream` flag, its message and its
  branch.

That last one is the pattern worth keeping: **two rounds of patching a flag disappeared when the
underlying question was stated correctly.** The special case existed because the query was wrong.

## Eleventh review pass — the record was the last thing wrong

*"After ten passes I could not find a new defect I would want fixed before merge."* What remained
was the record, and two of the three findings were about it — which is worth recording as its own
lesson, because both were flagged in earlier passes and left.

- **Acceptances 1 and 3 read as delivered and describe things this branch deliberately did not
  build.** The item had already annotated 4, 5, 7 and 9 when they came apart from reality, which is
  exactly what made the two unannotated ones read as met. Acceptance 1 says a stale lease blocks
  *commit, push* — it does not, by decision. Acceptance 3 says session start *refreshes* — it
  deliberately does not, and `architecture.md` argues at length that it must not. **A shipped item
  is never looked at again**, so ten of ten reading as met was the single most misleading artefact
  in the branch.
- **The PR body was eleven commits stale**, flagged three passes running. It is what rung 4 reads
  first and the only surface that says which parts of 2,900 lines are novel — so a stale body does
  not merely omit, it points attention at the wrong code.

The code finding: **`context brief` is the scaffolded session-start hook and made a network call
`--offline` could not reach.** `doctor` got exactly this treatment three commits earlier, on the
same argument, and the four `context` subcommands were missed — so a plane would have put a 15s
`ls-remote` timeout in front of every session with `MORPHEUS_OFFLINE=1` exported and doing nothing.

## Twelfth review pass — the fix for the record introduced the worst bug in the branch

Threading `--offline` into the four `context` subcommands was right for three and a **regression**
in the fourth. `check`, `status` and `brief` re-observe the *stored* receipt, so an `unknown`
written offline is discarded the moment the network is back. `refresh` **mints** the receipt, and
`remoteSha: sha ?? ""` bakes the skip in permanently.

`gate()` observes unconditionally, by design and correctly. So with a sticky `MORPHEUS_OFFLINE=1`
on a machine whose network is fine:

1. `context refresh` → receipt with `remoteSha: ""`, exit 1.
2. Any governed command → gate sees the real SHA against `""` → `remoteAdvanced` → status
   `refresh_required`, **not** `unknown`, so the offline branch is never entered and even the local
   actions are refused → *"run `morpheus context refresh`"*.
3. Back to 1.

Every governed command shut, on an online machine, with the refusal's own instruction regenerating
the state. **This is the shape this branch's own review table already names — *a declaration read
without the observation it modifies* — recurring one layer below where it was last fixed**, and
written by the person who wrote that row.

The generalisation that would have caught it: **the argument for skipping an observation is about
cost, and cost is a property of the caller, not of the observation.** `brief` is a hook and pays it
every session; `refresh` is user-initiated and exists to certify. Applying one command's argument
to a sibling because they share a module is how the two got conflated.

The test guarding it also passed whether or not the change was there — it asserted an unreachable
remote yields `unknown`, which is true either way. Replaced with one that stands up a *reachable*
remote, declares offline, and asserts the receipt still carries a real SHA and the gate still
permits local work.

## Thirteenth review pass — narrowing the wrong axis

Both findings were messages rather than gate defects, and both were the same mistake: **a condition
that looks like it narrows and does not.**

- **`context status`'s offline note was gated on the declaration.** Inside the term `check` returns
  before `offline` is read at all, so nothing was skipped — and the block then printed *"unknown is
  assumed"* one line under `✓ Context is fresh`, plus *"external actions are not permitted"*, which
  is wrong about behaviour: `gate` returns ok for a fresh lease before the offline branch is
  reached. It is on the observation now, which is the same correction `contained` got two commits
  earlier.
- **The inbox content match narrowed the wrong axis.** *"Names a blocked id"* replaced *"is under
  `hq/team/`"* — but `pm block` is what writes the id there, and the `❗` stays until the cycle
  archives it, which cannot happen while the item is blocked. So the predicate was true for the
  whole lifetime of the block and reduced to *the inbox is dirty*: a false positive on the routine
  cycle AGENTS.md mandates, in the command it tells you to run **before every claim**.

  The right question is **has this escalation ever reached a remote** — the newest version of the
  file on any remote, checked for the id. Two rounds were spent narrowing along "which files" when
  the axis was "which state".

## Fourteenth review pass — fixing the instance three times

`rev-list -1 --remotes -- <path>` takes a **pathspec**, which git reads relative to cwd — where
`--porcelain` and `--name-only` emit repo-root-relative paths. From a subdirectory the new
exclusion matched nothing, `pushed` came back empty, and the false positive it had just removed
came straight back.

**Third appearance of root-vs-cwd in the same function**, and each of the first two was fixed as an
instance: `noteWrite` relativising absolute paths, then the inbox read joining onto `rootDir`. The
third looked already handled *because `rootDir` was right there* four lines up, used for a
different call.

So this one is fixed as a class: **every git call in the function runs from the repo root, and
every path it touches is root-relative.** Three coordinate systems were in play — root-relative
output, cwd-relative pathspecs, and `join(cwd, path)` — and mixing them is not a mistake you stop
making by being careful, only by removing the choice.

## Fifteenth review pass — the only place this can destroy evidence

`noteWrite` re-fingerprinted a written record unconditionally, and its justification was *"the
agent read the record, then wrote it, so it knows the current contents"* — true only if the record
was unchanged between the receipt and the write. Nothing checked that, and the gate cannot:
`check` returns early for a fresh in-term lease **without re-reading the inputs at all**.

So on the flow AGENTS.md is built around — the inbox being *"the only file a human is expected to
edit"*:

1. 12:00 receipt fingerprints the inbox as **A**.
2. 12:01 Chris replies inline after a `~`. The file is **B**.
3. 12:02 `pm block` passes the gate in-term, appends, and `noteWrite` records **C**.
4. 12:06 the term expires, the inbox is **C**, the receipt says **C** — no drift, `fresh`.

**The reply is never surfaced, and the evidence that the file moved is gone permanently**, because
the receipt is the only record of what was read. Every other failure in this branch was a failure
to *act*; this one erases the input.

`block()` already held the answer — `existing`, the content it read before appending. Callers now
pass it, and the receipt is updated only where it still matches what the receipt asserts. Where it
does not, the receipt is left alone: the drift is real and the session did not see it.

Also: `ls-remote <remote> <branch>` is a **glob against ref tails**, so `main` matches
`refs/tags/main` and `refs/heads/feature/main`, and refname-sorted output puts `feature/main`
first — `split()[0]` then took the wrong SHA for the field the whole verdict turns on. Fully
qualified as `refs/heads/<branch>` now.

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
