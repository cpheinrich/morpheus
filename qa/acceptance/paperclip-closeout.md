# Paperclip conversation closeout prototype

Roadmap: MO-26-10-25-03.51.22

- The optional script freezes one explicit origin/company/issue/thread, source revision
  and cursor, all captured messages, sourced decisions, accepted structured answers,
  validation evidence and attachment references.
- Duplicate exports return exactly the prior identity and bytes. Reopened/changed
  conversations and changed verified attachment bytes create new immutable snapshots;
  old snapshots remain byte-identical.
- Attachment hashes are computed from stored bytes or explicitly labelled unverified.
  A declared hash cannot override a computed mismatch.
- Source or attachment churn between reads refuses snapshot publication. Every foreign
  target is rejected before writing. Traversal, symlinks and unsafe references refuse.
- Reads/writes are bounded and restricted to the requested Git repository; output files
  publish complete bytes exclusively. No API calls, PM updates, commits or completion.
- The documentation distinguishes the operator-frozen contract and content-derived
  snapshot identity from unavailable cross-resource API atomicity. Live acquisition,
  migration and private-content publication remain unqualified.

Validation: `pnpm exec vitest run tests/paperclip-closeout.test.ts`, `pnpm typecheck`,
`pnpm compile`, `pnpm morpheus pm index`. Tests use synthetic temp Git repositories;
no provider/service credentials, cloud resource or worker launch is required.
