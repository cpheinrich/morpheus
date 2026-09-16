---
roadmap: MO-26-09-09-09.40.13
date: 2026-09-09
agent: codex
---

# Focused local iOS testing

Chris requested focused local tests for the changed feature and directly affected features,
with the full suite left to CI unless explicitly requested locally. Updated AGENTS.md;
CLAUDE.md inherits the same instructions through its symlink.

Validation: reviewed the documentation diff and checked whitespace. No iOS tests are
needed for this guidance change. Full CI coverage remains required for iOS feature work.

Morpheus validation: typecheck, all 1,110 existing TypeScript tests, compilation, and
roadmap index checks passed. Invoked the compiled scaffold template with a sample
project and verified the emitted iOS policy. Regenerated committed dist output.
