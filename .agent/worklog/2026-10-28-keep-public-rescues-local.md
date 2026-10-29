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
- **Doctor uses "no remote-tracking ref" for unpushed.** It is network-free, and in an ordinary
  clone a push writes that ref. A `clone --single-branch` gets none even for a pushed rescue, so
  the finding says "likely only in this clone" (review R-2). A branch whose remote copy was deleted
  while a stale tracking ref survived is not listed. After `git fetch --prune` it is.
- **Private-repository commit messages and PR bodies change too.** They drop the absolute checkout
  path and full hostname, which departs from the item's "private repositories are unchanged, PR
  body included". The task brief that relayed Chris's decision asked for this for every repository
  (review R-3).

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

## Review

One fresh reviewer subagent (runner id `ae746649b721ace9b`, no inherited history) reviewed
`bfb77f20..aac48751` at high risk. The change decides whether unreviewed edits are published, and
it changes the duplicate match that allows `git reset --hard`. The runner measured 7.83 minutes.
The reviewer ran the two focused suites (64 passed), recompiled `src/` to confirm the committed
`dist/` matches, and confirmed #452's branch is gone. On the five specific questions it found:

- no path pushes or opens a PR unless visibility is known `PRIVATE`;
- no network call sits between a proof and its reset;
- local-mode dedupe cannot reset away edits that no branch holds;
- the cache can authorize publishing only inside the documented one-hour window;
- doctor is correct for ordinary clones.

It had four minor findings and one incidental one, with nothing substantive. The author fixed every
minor finding in `684d52a9`, without a follow-up turn:

- **R-1.** The visibility check read only configured URLs, so a cross-host `pushInsteadOf` could
  send a push somewhere unchecked. `GH_HOST` could also make `gh` answer for another server. The
  check now also reads `git remote get-url --push --all`: a GitHub destination is added to the
  check, and any other non-local destination makes the verdict unknown. It now asks for
  `github.com/<owner>/<repo>`. New unit tests cover both rewrite cases, and real `gh` accepts the
  host-qualified form.
- **R-2.** A single-branch clone has no tracking ref for a pushed rescue. The doctor finding now
  says "no remote-tracking ref … likely only in this clone", and the runbook names the limitation.
- **R-3.** The records now attribute the private-repository text change to the task brief.
- **R-4.** A `gh` that cannot start now reports `spawn … ENOENT`, not "exit 1". The runner is
  exported and tested.
- **R-5 (incidental).** Two older rescue branches are still public on morpheus. Deleting them is
  irreversible, so that is Chris's decision, tracked as MO-26-10-28-17.09.59.

After the fixes, `pnpm exec vitest run tests/trunk-rescue.test.ts tests/repo-visibility.test.ts
tests/agent-instructions.test.ts tests/doctor.test.ts` gave 107 passed, and `pnpm typecheck` and
`pnpm compile` were clean.

High-risk review cleared with no substantive findings. Minor R-1 (cross-host pushInsteadOf and GH_HOST could check a different repository than the push reaches), R-2 (single-branch clones make doctor list pushed rescues), R-3 (private-repository text change unattributed) and R-4 (missing gh reported as exit 1) were fixed by the author; incidental R-5 (two older rescue branches still public on morpheus) is deferred to MO-26-10-28-17.09.59 for Chris's decision.

```morpheus-review
{
  "version": 2,
  "base": "bfb77f2021a3402bd1fa6fcec6c65bf212962bd0",
  "reviewed": "aac48751cedeb2709ed6a87d8aad12f0446d3a80",
  "covered": "684d52a91164f8d9aa08074102ab9adb9a71363c",
  "authorSession": "0d17f3e2-e23e-440f-949e-057495fe4e55",
  "reviewerSession": "ae746649b721ace9b",
  "risk": "high",
  "elapsedMinutes": 7.831166666666666,
  "timing": {
    "source": "runner",
    "durationMs": 469870,
    "evidence": "Claude Code Agent tool result for reviewer agentId ae746649b721ace9b (initial turn): usage duration_ms=469870."
  },
  "outcome": "complete",
  "summary": "High-risk review cleared with no substantive findings. Minor R-1 (cross-host pushInsteadOf and GH_HOST could check a different repository than the push reaches), R-2 (single-branch clones make doctor list pushed rescues), R-3 (private-repository text change unattributed) and R-4 (missing gh reported as exit 1) were fixed by the author; incidental R-5 (two older rescue branches still public on morpheus) is deferred to MO-26-10-28-17.09.59 for Chris's decision.",
  "findings": [
    {
      "id": "R-1",
      "severity": "minor",
      "description": "Visibility was read for the configured remote URLs only, so a pushInsteadOf rewrite to another host or owner could push somewhere unchecked, and an unqualified gh repo view could answer for a same-named repository on GH_HOST.",
      "paths": [
        "src/session/repo-visibility.ts",
        "dist/session/repo-visibility.d.ts",
        "dist/session/repo-visibility.js",
        "dist/session/repo-visibility.js.map",
        "tests/repo-visibility.test.ts",
        "tests/trunk-rescue.test.ts",
        "docs/runbooks/context-freshness.md",
        ".agent/decisions.md"
      ],
      "disposition": "fixed",
      "response": "rescueRepositories also reads git remote get-url --push --all: a GitHub destination joins the checked set and any destination that is neither GitHub nor a local path is unidentified, so the rescue stays local. gh is asked for github.com/<owner>/<repo>. Unit tests cover a rewrite to another GitHub repository and to a non-GitHub SSH host; real gh accepts the host-qualified form."
    },
    {
      "id": "R-2",
      "severity": "minor",
      "description": "In a clone whose fetch refspec maps only some branches, a pushed private rescue has no remote-tracking ref, so doctor said it existed only in this clone with no remote copy.",
      "paths": [
        "src/session/trunk-health.ts",
        "dist/session/trunk-health.d.ts",
        "dist/session/trunk-health.js",
        "dist/session/trunk-health.js.map",
        "tests/trunk-rescue.test.ts",
        "docs/runbooks/context-freshness.md",
        "architecture.md"
      ],
      "disposition": "fixed",
      "response": "The finding now says the branches have no remote-tracking ref and are likely only in this clone; the code comment, runbook and architecture name the single-branch limitation, and the worklog's claim that every push writes the ref was corrected."
    },
    {
      "id": "R-3",
      "severity": "minor",
      "description": "The item said private repositories are unchanged, PR body included, but the change also strips the checkout path from private-repository text without the records saying who decided that.",
      "paths": [".agent/decisions.md"],
      "disposition": "fixed",
      "response": "The decisions entry and the worklog now state the departure and attribute it to the task brief that relayed Chris's decision."
    },
    {
      "id": "R-4",
      "severity": "minor",
      "description": "When gh is not installed the promisified execFile error has an empty stderr, which the ?? fallback kept, so the brief's reason read only '(exit 1)'.",
      "paths": [
        "src/session/trunk-rescue.ts",
        "dist/session/trunk-rescue.d.ts",
        "dist/session/trunk-rescue.js",
        "dist/session/trunk-rescue.js.map",
        "tests/trunk-rescue.test.ts"
      ],
      "disposition": "fixed",
      "response": "runCommand uses stderr || message and is exported; a test runs a command that does not exist and asserts the stderr is 'spawn <command> ENOENT'."
    },
    {
      "id": "R-5",
      "severity": "incidental",
      "description": "Two rescue branches pushed before this change (wip/trunk-2026-10-08-* at fbf69e3b and wip/trunk-2026-10-25-* at 990d0136) are still public on cpheinrich/morpheus, with absolute checkout paths in their commit messages.",
      "paths": ["hq/product/roadmap/MO-26-10-28-17.09.59-retire-public-rescue-branches.md"],
      "disposition": "deferred",
      "response": "Not caused by this change, and deleting a remote branch is irreversible, so the disposition is Chris's; filed with options and a verification command.",
      "roadmap": "MO-26-10-28-17.09.59"
    }
  ]
}
```
