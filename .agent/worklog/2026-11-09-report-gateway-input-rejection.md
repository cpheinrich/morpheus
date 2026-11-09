---
date: 2026-11-09
roadmap: MO-26-11-09-15.45.51
tags: [engineering]
---

# Report a typed unattended gateway input rejection

Issue #663 reported a resumed Codex worker that started its thread, then rejected the rendered input before inference. Two retained local stderr logs use the typed input error field on a turn-start rejection. The process evidence confirmed a nonzero exit with verified cleanup and no started turn. The change recognizes that specific shape in a bounded private-log tail and returns only its stable code.

The CLI regression sends 1,048,575 bytes before handoff, then a synthetic provider refuses the enlarged resumed turn. It checks exit and cleanup proof, same status after deleting the cached result, omission for a message-only lookalike or started turn, and the absence of prompt and stderr markers in the output. All 25 unattended-worker tests passed, as did Factory source checks, root typecheck, compile, PM index and complexity.
