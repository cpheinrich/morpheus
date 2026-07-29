# Learned

Durable facts worth knowing before starting work here. Append; do not rewrite history.

- **YAML frontmatter converts unquoted dates to `Date` objects.** `2026-07-01` arrives as a Date,
  not a string. `isoDate` in `src/pm/schema.ts` normalises both. Do not "fix" this by requiring
  quoted dates — hand-written frontmatter should stay natural.
- **A colon in an unquoted YAML value is a syntax error.** Titles routinely contain them. `pm new`
  quotes defensively; the parser reports the failure as an issue rather than throwing.
- **The parser must never throw on bad input.** `pm validate` is expected to report every problem
  in one run. Anything that can fail per-file returns a `ParseIssue` instead.
- **`morpheus init` is deliberately not built yet.** The first retrofit (RM-007, Evo) is its
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
