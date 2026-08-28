---
agent: codex
date: 2026-08-28
roadmap: MO-26-08-28-13.14.45
outcome: review
---

# Extract reusable HQ search

## What changed

- Added browser, build, optional PDF, and React subpaths under `morpheus-kit/hq-search`.
- Kept source catalogues, authenticated routes, and visual classes project-owned while sharing the
  versioned index contract, MiniSearch ranking, snippets, Markdown conversion, embedded PDF text
  extraction, private-cache header contract, and lazy accessible dialog.
- Documented the privacy, deployment, lazy-download, filename-only, and scaling boundaries in the
  architecture and module README.
- Kept `pdf-parse`, React, and React DOM optional peers; projects that do not use the PDF or React
  surfaces do not install those dependencies through Morpheus. MiniSearch has no dependencies and
  is 826,513 unpacked bytes in the reviewed 7.2.0 registry record.

## Verification

- TypeScript typecheck passed.
- Full suite passed: 35 files and 1,004 tests, including nine new engine/build/PDF/dialog tests.
- Package compilation and the committed-export manifest test passed; `npm pack --dry-run` is part of
  the final PR verification.
- `morpheus pm index` completed with every generated index unchanged; `git diff --check` passed.

## Dead ends and limits

- The first npm registry lookup ran inside the restricted network and returned no result; the
  approved read-only retry recorded MiniSearch 7.2.0 and pdf-parse 2.4.5.
- The Homebrew pnpm 11.22 wrapper stalled before starting non-install scripts. The bundled pnpm
  11.19 runtime executed the repository's exact typecheck, test, and compile scripts successfully.
- The first roadmap-index run was denied access to tsx's local IPC socket; the approved retry ran
  normally and changed nothing.
- After exact clone indexing was enabled, the codebase-memory MCP transport closed for this task.
  Candidate files were therefore verified through the repository-sanctioned targeted source
  fallback; a fresh task can query the now-current indexes.
