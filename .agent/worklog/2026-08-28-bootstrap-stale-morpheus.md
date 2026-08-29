---
roadmap: MO-26-08-28-17.31.22
date: 2026-08-28
agent: codex
---
# Bootstrap stale Morpheus installations

The reported Lakina failure reproduced a circular first-use bridge: PR #195 shipped only agent
instructions, those instructions fell back to `morpheus self update`, and `self` itself did not
exist before Morpheus PR #167. The provider hook also invoked the stale binary directly.

The repair uses a generated, checked-in session shim that only detects capability and emits the
consent instructions. After yes, a separate shell bootstrap clones reviewed current `main` and
invokes that clone's committed CLI directly; after no it writes only the disabled device choice.
This keeps consent explicit without requiring the broken installation to repair itself.

A quick npm search for CLI self-update/bootstrap packages returned no credible lightweight fit.
The required behavior is Morpheus-specific and small: exact reviewed `main`, the copied-package
installer, registry registration, marked Git hooks, and the existing consent schema.

The focused bootstrap, installer, initializer and doctor suite passes 107 tests. The complete
Morpheus suite passes 1,017 tests, including a fake pre-`self` binary that would leave a trace if
the bootstrap called it; no trace is written. A previously device-dependent session-gate fixture
was also made explicit about its unconfigured auto-update preference.
