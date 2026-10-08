# Context freshness — operating detail

**Read this when** a gated command refuses, you are offline or on a fork, a hook is not firing, or you are wiring `context install` into a project. `AGENTS.md` keeps the everyday rule; the reasoning is [`architecture.md` §7.10](../../architecture.md).

Run `morpheus context brief` at session start if the standard hook did not run. It fetches the
canonical trunk and fast-forwards only a clean local trunk. It never rebases an active task or
rewrites dirty work. Follow its absolute `WORK IN` path when a session has a saved task association.
A behind checkout cannot issue a fresh receipt: integrate trunk explicitly, then re-read records.

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
refresh without reading.** The receipt is your assertion, and a receipt taken to clear a gate is
the one failure mode the whole protocol cannot detect.

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
