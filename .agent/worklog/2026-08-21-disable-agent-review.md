---
roadmap: MO-26-08-21-15.32.33
agent: codex
---

# Temporarily disable Morpheus agent review

The tempting one-line change was an `if: false` on Morpheus's caller job. That would remove the
nested `agent-review / delivery` status entirely, but branch protection requires that exact status;
the pause would therefore block every PR.

The off switch instead lives in the reusable workflow and gates both of its jobs. Morpheus's two
callers pass `enabled: false`, while the input defaults to `true` for existing consumers. This
preserves the workflow, its secrets and permissions, the trusted-author request guard, and the
required delivery check's skipped-and-satisfied shape. Re-enabling Morpheus requires only removing
the two overrides or setting them to `true`.
