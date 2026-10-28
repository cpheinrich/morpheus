---
date: 2026-10-28
agent: claude
roadmap: MO-26-10-28-15.37.55
outcome: review
tags: [engineering, devops]
summary: Trunk rescues are pushed and opened as draft PRs only on private repositories; elsewhere they stay local branches that brief and doctor surface, and published rescue text no longer carries the checkout path.
---

# Keep trunk rescues local on public repositories

## Why

`context brief`'s dirty-trunk rescue pushed a `wip/trunk-*` branch and opened a draft PR on every
repository. On public morpheus, #452 published an agent's private working document, a Tailscale
hostname and local paths; closing it unpublished nothing. Chris, 2026-10-28: "For public repos, we
don't have to automatically push rescued changes." #452 was closed and its branch deleted the same
day, with a private copy under the ignored `local/rescued/`.

## What changed

- **`src/session/repo-visibility.ts` (new).** Identifies every repository a rescue would reach (the
  push remote's push and fetch URLs, the trunk remote on a fork) from configured URLs, reads
  `gh repo view <repo> --json visibility`, and returns `publish: true` only when every one is
  exactly `PRIVATE`. Public, `INTERNAL`, non-GitHub remotes, `gh` failing or throwing and
  unparseable output each produce a plain-language `reason`. Answers are cached for one hour in the
  primary checkout's ignored `local/sessions/repo-visibility.json`. Failures are never cached, and a
  future-dated or corrupt entry is re-read.
- **`rescueDirtyTrunk`.** The verdict is read before the proof/reset window, beside the existing
  duplicate lookup. When the repository is not known to be private, the rescue commits, proves and
  resets exactly as before, then returns `keptLocal: <reason>` with the diffstat. It never pushes,
  never calls `gh pr`, and never deletes the branch. Duplicate detection in that mode accepts a
  recent local branch whose change replays to the same tree, with no live-remote or PR requirement.
  The commit message and PR body name the trunk branch and the short host label, not the absolute
  checkout path.
- **`formatRescue`.** A local rescue prints the branch, the reason, a capped diffstat, the
  `git switch`/`git cherry-pick` recovery and the two commands to publish deliberately. A local
  duplicate names the local branch.
- **`trunk-health` / `doctor`.** `localRescueBranches` lists `wip/trunk-*` branches with no
  remote-tracking ref on any remote (refs only, no network), with date and file count. The finding
  is emitted from any checkout, not only trunk, because branches belong to the repository.
- **Records.** Decision entry (superseding the publishing half of the 2026-10-08 and #542 entries),
  a `learned.md` entry, the context-freshness runbook, `architecture.md` §7.10, the `AGENTS.md`
  line and its `src/init/templates.ts` mirror, and the `self install` refusal wording.

## Decisions made without asking

- **One-hour cache, not "about a day".** A repository can be made public at any time, and a stale
  `PRIVATE` is the only cached value that publishes. The cost is one `gh` call per hour of rescues,
  and rescues are rare.
- **`INTERNAL` keeps the rescue local.** It is not public, but the rule is "publish only when known
  private", and no Morpheus project uses an enterprise. This can be flipped if one ever does.
- **Raw config URLs, not `git remote get-url`.** `insteadOf` changes the transport (mirrors, SSH
  aliases), not the repository. A host alias such as `github.com-work:` does not match and
  therefore keeps rescues local, which is the safe direction.
- **Every reachable repository is checked**, including the push remote's fetch URL when a separate
  push URL exists. `gh pr create` without `--repo` resolves its own base, so checking only the push
  URL could miss where the PR lands.
- **Doctor uses "no remote-tracking ref" for unpushed.** It is network-free, and every successful
  push writes that ref. A branch whose remote copy was deleted while a stale tracking ref survived
  is not listed. After `git fetch --prune` it is.

## Considered

- An injected `visibility` function for tests. Rejected: the fixtures would then not exercise the
  real repository identification. The fixtures instead point `origin` at
  `https://github.com/o/r.git` with `url.<bare>.insteadOf` (and `pushInsteadOf` for forks). Config
  names a GitHub repository while fetch and push stay on disk, and the `gh` mock answers
  `repo view`.

## Dead ends

- None in the code. A harness rule refused a Python heredoc that mentioned `git` in its text, so
  those edits went through the Edit tool instead.

## Verification

- Focused: `pnpm exec vitest run tests/trunk-rescue.test.ts tests/repo-visibility.test.ts
  tests/doctor.test.ts tests/session-start.test.ts tests/agent-instructions.test.ts
  tests/doctor-instructions.test.ts`, 129 passed. That covers the rescue and visibility modules,
  the doctor and session-start callers, and the AGENTS/template instruction checks touched by the
  wording change.
- Fixture-repository tests assert by value:
  - Public and failed-read visibility each leave a local branch with the content, no `wip` ref on
    the bare remote or as a tracking ref, no `gh pr` call, and a reset plus fast-forward.
  - Unparseable output, `INTERNAL`, a throwing runner and a non-GitHub remote (credentials
    redacted, `gh` never asked) all stay local.
  - On a fork with a private fork and a public base, the rescue stays local.
  - Private still pushes and opens the draft, and visibility is asked for exactly `o/r`.
  - A second identical dirty trunk reports `duplicate` against the local branch with no `prUrl`
    and no second branch, while a different edit still gets `-2`.
  - Doctor lists only the never-pushed branch, with its file count, from trunk and from a task
    branch.
  - The commit message and PR body equal the expected text and contain neither the temp path, its
    realpath, `tail1234`, `ts.net` nor the original-case hostname.
  - The default cache file is written in the fixture's ignored `local/`, reused, and leaves
    `git status` clean.
- Unit tests: the cache boundary (used at `VISIBILITY_CACHE_MS - 1`, re-read at exactly
  `VISIBILITY_CACHE_MS`), future-dated, corrupt and unknown-version caches, failures never
  cached, and URL identification including `insteadOf`.
- Mutation: forcing `publish = true` failed all seven local-mode tests.
- `pnpm typecheck`, `pnpm compile` and `pnpm morpheus pm index` were run. `pnpm compile` also
  reorders the `disposition` union in `dist/review/local.d.ts` (`fixed` before `open`). The source
  for that file did not change, but tsc's literal-type order follows the whole program. Two
  compiles produced the same output, so the regenerated file is committed as CI's dist check
  expects.
- Full `pnpm test` (once): 3794 passed, 7 failed. Six were `tests/workflow-expressions.test.ts`,
  which needs the `actionlint` binary; it is not installed on this machine, and CI installs it. The
  seventh was this change: the scaffolded `AGENTS.md` reached 16,020 bytes against a 16,000 cap. The
  template line was shortened, and `tests/agent-instructions.test.ts` plus the focused set were
  re-run: 129 passed.
- Real `gh` (2026-10-28):
  - `gh repo view cpheinrich/morpheus --json visibility` printed `{"visibility":"PUBLIC"}`.
  - `cpheinrich/kairos` printed `{"visibility":"PRIVATE"}`.
  - A missing repository exits 1 with `GraphQL: Could not resolve to a Repository…`.
  - The compiled `rescueRepositories` + `publishVerdict`, run in this checkout with the real
    runner, returned `{"publish":false,"repos":["cpheinrich/morpheus"],"reason":"cpheinrich/morpheus is public"}`.
- Not run: a full rescue of a real dirty trunk. The fixture tests drive the same Git path, and only
  the `gh` answer is mocked there.
