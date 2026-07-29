# Learned

Durable facts worth knowing before starting work here. Append; do not rewrite history.

- **YAML frontmatter converts unquoted dates to `Date` objects.** `2026-07-01` arrives as a Date,
  not a string. `isoDate` in `src/pm/schema.ts` normalises both. Do not "fix" this by requiring
  quoted dates — hand-written frontmatter should stay natural.
- **A colon in an unquoted YAML value is a syntax error.** Titles routinely contain them. `pm new`
  quotes defensively; the parser reports the failure as an issue rather than throwing.
- **The parser must never throw on bad input.** `pm validate` is expected to report every problem
  in one run. Anything that can fail per-file returns a `ParseIssue` instead.
- **`morpheus init` is deliberately not built yet.** The first retrofit (MO-007, Evo) is its
  specification. Building it first would encode guesses about a structure no project has lived in.

- **Firebase's `addFirebase` returns `403 caller does not have permission` when the account has
  never accepted the Firebase Terms of Service.** It is not an IAM, scope, or org-policy problem,
  and the error names none of that. Accepting the terms once in the console — for any project —
  unblocks the API account-wide, after which the CLI works for every other project.

  Cost a long debugging session on 2026-07-29: chased OAuth scopes, `roles/firebase.admin`,
  domain-restricted-sharing, and automatic-IAM-grants policies, all of which were fine.
  **When a Google API returns a permission error that survives being Owner, check whether the
  product's terms have ever been accepted before touching IAM.**

- **`gcloud projects list` returns stale results for minutes** after a create or delete.
  `gcloud projects describe` is authoritative — do not use the list to confirm a mutation.

- **GCP project ids are globally unique**, so short generic names are always taken. Convention is
  an org prefix: `dh-darwin`, `dh-evo`. Display names must be **at least 4 characters**, and that
  failure is easily misread as "id taken".

- **Every abandoned Google Cloud create-project or trial flow leaves a junk project behind.**
  Seven accumulated in one session.

- **`git add -A` sweeps up whatever the editor left behind.** A 448 KB screenshot pasted into
  Nimbalyst landed in `hq/inbox/assets/` and was committed to a public repo without anyone
  choosing it. Images are now gitignored with an exception for `hq/brand/assets/`.

  **Screenshots belong in chat, not the repo.** An inbox archive does not need to be complete —
  the decisions distilled from it are what matter, and a binary in a text repo is permanent
  weight even after deletion.

  Prefer `git add <paths>` over `git add -A` when an editor with its own scratch state is in use.

- **Git does not track empty directories.** Scaffolding created with `mkdir` and no file in it
  ships missing and nobody notices until someone looks. Write a README into every directory the
  scaffold creates — it explains the directory *and* makes it exist.

- **`tsc` does not preserve the executable bit**, so `dist/cli/index.js` is unrunnable after every
  build even with a shebang. The build script chmods it. Symptom is `command not found` or
  `permission denied` from a `npm link`ed binary that clearly exists.

- **`gh pr merge --auto` can fire on a stale head.** Enabled on a PR whose checks were failing,
  it merged *without* a fix pushed afterwards — the roadmap item that PR added was silently lost
  from `main`.

  **Only enable auto-merge once the branch is complete.** Before that, `gh pr checks --watch`,
  fix, then set `--auto`. Auto-merge is a queue, not a promise to merge whatever arrives later.

- **`pnpm/action-setup` fails if both `version` and `packageManager` are specified.** Reusable
  workflows must leave `pnpm-version` empty so the lockfile-pinned `packageManager` wins.
  Evo never hit this because it lacks the field — the repo following the *stricter* practice is
  the one that broke.

- **Never hand-name a branch. Use `morpheus pm claim <ID>`.** It creates the branch *from* the
  item id, so they cannot disagree. Hand-naming produced a `check pr` failure twice in one
  session — the branch referenced an id that did not exist because the item had not been
  allocated yet.

## Never let an unanswerable question render as a confident answer

Three occurrences now, so it is a rule rather than a run of bad luck:

- GCP project ids reported as "taken" by grepping for `^ERROR`. The real error was a display name
  under four characters.
- `mergedPrs` must return `null` when `gh` is missing, not `[]`. "No merged PRs" is evidence; "gh
  is absent" is not, and collapsing them makes a missing tool look like a clean board.
- Onboarding detection returns `true | false | null`. A missing `gh` rendering as an unprotected
  branch sends someone to fix what was never broken.

The shape is always the same: a failure to determine something gets encoded as a determination.
When a check cannot run, say it did not run.

## A check that skips what is absent will report an empty thing as correct

Four instances in one day:

- `tokens.json` existing but empty read as a finished token system
- `goal` and `inbox` detectors checked for a filename, so an empty file passed
- `agents-md` checked that both paths exist, so two divergent real files passed where a symlink
  was required
- `checkDrift` skipped absent files, so a brand package that had never been generated reported as
  fully current

The shape is always the same: the loop says `if (!exists) continue`, which reads as "nothing to
compare" and renders as "nothing wrong". **When writing a check, ask what a false positive looks
like** — and specifically, what it reports when handed nothing at all.

Related but distinct from *never let an unanswerable question render as a confident answer*: there
the tool cannot determine the answer, here it can and treats absence as assent.
