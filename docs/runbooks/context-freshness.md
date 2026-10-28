# Context freshness — operating detail

**Read this when** a gated command refuses, you are offline or on a fork, a hook is not firing, or you are wiring `context install` into a project. `AGENTS.md` keeps the everyday rule; the reasoning is [`architecture.md` §7.10](../../architecture.md).

Run `morpheus context brief` at session start if the standard hook did not run. It fetches the
canonical trunk and fast-forwards the local trunk. It never rebases an active task or touches a
task branch. Follow its absolute `WORK IN` path when a session has a saved task association.
A behind checkout cannot issue a fresh receipt: integrate trunk explicitly, then re-read records.

Session Git commands have a 30-second deadline. If Morpheus stops one at that deadline, the
error explicitly names the timeout and SIGTERM, followed by the original command/error.
For a remote command such as fetch, check network access to the configured remote before
retrying. Ordinary Git failures retain their own stderr; a timeout does not certify freshness.


### A dirty trunk checkout is rescued, not left behind

A trunk checkout with uncommitted edits cannot fast-forward, and a one-line "behind" notice is
easy to ignore: Lakina's main checkout sat 188 commits behind for three weeks behind one
Xcode-rewritten `project.pbxproj`. So when HEAD is the trunk branch and tracked files are modified
(staged or not), `brief`:

1. commits the working tree's tracked content to `wip/trunk-<YYYY-MM-DD>-<host>` (Pacific date;
   `-2`, `-3`… if taken locally) without touching your index, and proves the commit matches the
   tree — once before creating the branch and again immediately before resetting;
2. resets trunk to its last commit. Nothing slow runs between the proof and the reset, so an
   editor saving during the push below lands on the reset tree instead of being lost;
3. **only on a private repository**, pushes the branch to `origin` and opens a **draft** PR titled
   *WIP: uncommitted changes rescued from <repo> main (<date>)*, listing the files, the diffstat
   and how far behind trunk was (on a fork, against the trunk remote's repository), then
   fast-forwards and prints one line with the PR URL. The commit message and PR body name the
   trunk branch and a short host label, never the checkout's absolute path or full hostname.

**On a public repository the rescue stays local.** Pushing would publish whatever was lying in the
checkout: morpheus #452 put an agent's private working document, a Tailscale hostname and local
paths on the public web, and closing a PR unpublishes nothing. Before the proof, `brief` asks
`gh repo view <owner/repo> --json visibility` for every repository the rescue would reach — the
push remote's push and fetch URLs and, on a fork, the trunk remote — and publishes only when every
one reads exactly `PRIVATE`. Public, internal, a remote that is not on GitHub, a missing or failing
`gh` and an answer it cannot parse all keep the branch local: **unknown is public**. Answers are
cached for one hour in the primary checkout's ignored `local/sessions/repo-visibility.json`; a
failed read is never cached. A local rescue gets the same commit, proofs and reset, and then
nothing else — no push, no PR, and the branch is never deleted automatically, because it is the
only copy. `brief` prints the branch, the diffstat, why it was not pushed, how to recover it
(`git switch <branch>`, or `git cherry-pick <branch>` onto another branch) and how to publish it
deliberately (`git push origin <branch>`, then `gh pr create --draft --head <branch>`).
`morpheus doctor` and `doctor --all` list every `wip/trunk-*` branch with no remote-tracking ref,
from any checkout of the repository, until someone deletes it with `git branch -D`.

It refuses, and reports instead, when a file's staged content differs from both HEAD and the
working tree (committing the tree would drop the staged version), when a file removed from the
index is still on disk (`git rm --cached`: no commit would hold that file, and the reset would
overwrite it), and when anything under `hq/team/` is edited — those are inbox replies, which belong
to the session starting there to read them, on an `inbox-<date>` branch.

**IDE churn is reset, not rescued.** When every tracked edit is churn — per-user IDE state
(`xcuserdata/`, `.DS_Store`, JetBrains' `workspace.xml` and other per-user files), a `.pbxproj`
changed only in whitespace, comments or dictionary key order, an `.xcscheme` or
`.xcworkspacedata` re-serialised with the same elements and attributes, or content trunk already
has — `brief` resets it after the same content proof, opens nothing, and prints one line naming
the commit that held the edits (`git checkout <sha> -- <path>` recovers one until Git prunes it).
One real edit among them and the whole set is rescued as above. The rule is deliberately narrow —
`.vscode/`, added files and any value change trunk lacks are rescued; see
`src/session/trunk-churn.ts`.

**A repeat is not rescued twice.** When an open rescue PR's change, replayed onto the current HEAD,
gives exactly these edits, the checkout is reset without another PR and the brief names the
earlier one. A failed lookup, a closed PR or a branch missing from the remote falls back to an
ordinary rescue. Where rescues stay local there is no PR to require: a recent local `wip/trunk-*`
branch whose change replays to these edits is the match on its own, and no second branch is made.

**Untracked files are never committed or deleted** — that is where secrets and build junk live.
They are listed in the PR (or the brief), and untracked build output whose source no longer exists
(`dist/foo.js` with no `src/foo.ts`) is named as safe to delete. Git's own `--ff-only` refuses if
the merge would overwrite one, and `brief` says so. Nothing happens mid-merge, -rebase,
-cherry-pick, -revert or -bisect; the checkout is reported loudly instead. If the push fails the
edits stay on the local branch and the reset still happens; if `gh` fails, the branch is pushed and
the command to open the PR is printed.

The draft is not a finished change: `check pr` conventions wait on drafts. The GitHub Manager never
reviews, repairs, merges, triages or escalates one; in a repository opted in to it, once the draft
has gone 7 days without a push (`RESCUE_MAX_AGE_DAYS`) the manager closes it with a comment on
recovering it, and the branch is kept. The PR body says so only where that policy exists. Adopt it
onto a roadmap item's branch before then, or close it yourself.

A checkout still behind after startup prints `!!! STALE CHECKOUT` past 20 commits or once the oldest
missing commit is more than 3 days old (`STALE_BEHIND_*` in `src/session/trunk-rescue.ts`).

**Fleet view.** `brief` only acts in the checkout a session starts in, which is exactly the one
nobody opens. `morpheus doctor --all` reports every registered project whose trunk checkout is
dirty or behind past those thresholds, orphaned build output, and never-pushed local rescue
branches, without writing anything. It
measures against the remote tip when that commit is already local, otherwise against the cached
remote-tracking ref, and says when that cache may be stale.

`morpheus self install` refusing a dirty source checkout lists tracked edits, orphaned build output
(safe to delete) and other untracked files separately. `self update` and `self ensure` build from a
disposable clone and never read a working checkout, so they have nothing to rescue.

**Read `.agent/decisions.md`, `.agent/learned.md` and `hq/team/<your handle>.md`, then:**

```sh
morpheus context refresh
```

This takes a *context receipt* — your assertion that you have loaded current project state,
fingerprinted against the tip of `origin/main`. It is good for **five minutes**, after which the
next governed command re-checks the trunk and those records rather than trusting the old verdict —
and re-certifies the receipt by itself when nothing moved.

**Until you have one, these are refused:** `pm claim`, `pm new`, `pm link-issue`, `pm block`,
`access sync`, `firebase auth setup`, and the provisioning half of `web init` (the list is `GATED`
in `src/session/gate.ts`). Nothing else is gated — a check that fires on `pm index` trains you to
route around it, and the routing-around outlives the staleness.

**Refresh once per session, then only on refusal.** Read the records once at session start and
refresh once. After that, run the gated command; the gate does the re-checking. Refresh again only
when a gated command refuses, and then re-read only what the refusal or the refresh names. Never
pipe `refresh` output through `head` or `tail`: the delta it prints is what you re-read. Measured
over August–October 2026, agents refreshed 738 times (median four per session), about half within
five minutes of the previous refresh, while only 25 of 828 gated commands were ever refused.

**Refresh is idempotent.** When the trunk and every required record are exactly as this
worktree's receipt saw them, `refresh` extends that receipt and prints one line — *Context
unchanged since …; nothing to re-read*. The October instruction to refresh less did not change
behaviour (refreshes per session rose), so a redundant refresh is now simply free instead of
being a reason to re-read 139 KB of decisions or pretend to.

### Read evidence

`refresh` used to be a bare assertion, and transcripts showed agents taking it without reading:
`cat .agent/decisions.md … >/dev/null && morpheus context refresh`. Now a **read hook** records
what each tool call actually showed the model, and where it is live, `refresh` certifies a record
only where that log covers it **at the record's current content**.

- **What counts.** A Read tool result, by its line range, after checking the returned text is what
  is on disk. Shell output, by content: the record's lines that appear verbatim and in order in
  what the command returned, in runs of at least 16 non-space characters. `>/dev/null`, `| wc` and
  numbered output (`cat -n`, `grep -n`) leave nothing to match; `| head` earns only the lines it
  let through. Shell output over 20,000 bytes (8,000 for Codex) earns nothing, because Claude Code
  keeps ~30,000 characters in the hook payload while showing the model a 2 KB preview. Ranges from
  several reads add up, so a large record can be read in pieces.
- **What is required.** With no usable receipt (every new session — `brief` discards the last
  one), every line of every required record. With a receipt that was itself recorded, only the
  hunks that changed since it, from Git's own diff against the content snapshot taken with it.
  An asserted receipt, or one taken before evidence existed, is never the baseline a recorded
  one extends.
- **What a refusal does.** It writes nothing, names each record and its unread line ranges, and
  prints the changed lines raw (with enough context to count). Where the hook can see that
  output it *is* the reading, so the next `refresh` certifies; otherwise read the ranges with the
  Read tool (offset/limit) or `sed -n 'A,Bp' <path>` with nothing piped or redirected.
- **Content-addressed, so checkouts share it.** Evidence is keyed by record and content
  fingerprint, and `refresh` reads the logs of every worktree of the repository. Records read in
  the primary checkout count in the task worktree `pm claim` prepares at the same trunk.
- **Your own writes are not deltas.** `pm block` and other recorded writes move the receipt and
  its snapshot together, so the next refresh does not ask you to read what you wrote.

The log is `local/sessions/reads.jsonl` in each checkout (ignored, pruned past 256 KB to the last
two days); entries carry a hash of the provider session id, never the raw id, and never content.
The snapshot is `local/sessions/<lease>.records.json`. `pm cleanup` treats both, like the lease, as
generated.

**Where no hook is watching, refresh falls back to the assertion and says so** — `! Certified by
assertion: …`. That is a human terminal, a tool without hooks, a project not yet wired, a Codex
hook not yet trusted, or a Claude session that started before the hook was added (Claude snapshots
hooks at session start). The hook only enforces after it has run in this session and understood a
tool result, so an unrecognized payload shape degrades to the warning, never to a lockout.
`MORPHEUS_READ_EVIDENCE=off` forces the assertion for a hook that runs but demonstrably cannot see
a read; the receipt records `asserted` and `context status` shows it. It is not a way to skip
reading.

The hooks, both scaffolded by `init` and merged in by `context install`:

| File | Events | Matcher |
|---|---|---|
| `.claude/settings.json` | `PostToolUse`, and `PostToolUseFailure` (a Bash that exits non-zero, which is how `refresh` prints a refusal) | `Read\|Bash`, `Bash` |
| `.codex/hooks.json` | `PostToolUse` | none — Codex's shell tool name is undocumented, so every result is scanned |

Each runs `morpheus context record-read` inline, silently, exiting 0 whatever happens — a hook
error after every tool call would be noise, and missing evidence already fails safe. Codex needs
the new hook trusted with `/hooks`, like the session-start one.

```sh
morpheus context status    # what the current lease says, and how old it is
morpheus context check     # exit non-zero unless fresh — for hooks and scripts
morpheus context brief     # session start: fetches trunk, updates clean trunk, identifies task
morpheus context install   # wire the hooks that run `brief`, and declare the inbox
```

**`brief` runs by itself only where something is wired to run it.** Two files, one per
provider, both scaffolded by `morpheus init` and both repairable by `morpheus context install`:

| File | Read by |
|---|---|
| `.claude/settings.json` | Claude Code — `hooks.SessionStart` |
| `.codex/hooks.json` | Codex — the same schema, its own file |

`context install` is the path for a project that already exists, because `init` skips any file
already present — correct for a scaffold, and the reason six of eight projects had no hook months
after the protocol shipped. It merges rather than overwrites, is safe to re-run, and also declares
`context.handle` so `hq/team/<handle>.md` joins the required set. Without that declaration a
session certifies `fresh` having never opened the file a human replies in.

**Codex will not run an untrusted hook, and says nothing when it declines.** Once per project, run
`/hooks` in a Codex session and trust it. Trust is recorded against the hook's hash, so editing the
file means trusting it again — and until then `.codex/hooks.json` exists and does nothing, which
looks exactly like working.

**When something has moved**, `context refresh` prints what landed on the trunk and which records
changed. Re-read those and refresh again — the delta is the point, not the ceremony. **Do not
refresh without reading.** Where the read hook is live it refuses to; elsewhere the receipt is
still your assertion, and a receipt taken to clear a gate is the failure the assertion cannot
detect.

**Offline**, set `MORPHEUS_OFFLINE=1` — or pass `--offline`. Local work proceeds; anything that leaves the machine —
pushing a claim, granting access — stays refused, because an unverified trunk is exactly when you
should not be operating external controls. **`pm block` still works**: it writes the records and
skips the push, telling you the block is not visible to other sessions yet. Blocking rather than
guessing is the one escape hatch a stuck session needs most, so it is not the one to take away.

**On a fork**, set `"context": { "trunk": "upstream/main" }` in `morpheus.json`. `origin` is
your fork, whose `main` sits still while the real trunk moves — measured against it, a lease
certifies fresh forever. `morpheus doctor` reports a trunk that does not resolve.

Receipts live in `local/sessions/`, keyed by worktree, and are gitignored. A receipt says *this
working copy read these files*, which is true of one machine — committing it would turn a local
observation into a claim about everyone. Shared evidence stays the worklog, the commit and the PR.

Why it exists and what it is built against: [`architecture.md` §7.10](../../architecture.md).
