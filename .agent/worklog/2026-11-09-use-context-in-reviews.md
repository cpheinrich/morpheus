---
roadmap: MO-26-11-09-22.31.46
tags: [engineering, devops]
---

# Use Tantivy context in reviews and delegated tasks

Earlier local Codex transcripts showed project-record shell searches in sixteen reviewer or child
sessions without an MCP search. The canonical review packet asked for relevant decisions but did
not specify the context tool. Fresh child sessions did not consistently receive the root session's
startup cue. Codebase-memory has explicit tool selection guidance, a device-level SubagentStart
hook as well as SessionStart, and exact-checkout indexing and verification. The Morpheus context
cue now travels in SubagentStart, the review packet, and both Factory handoffs. Factory's existing
MCP worktree pin remains in force.

Tantivy is the only live engine for MCP and CLI. The startup core stays opt-in through the existing
manifest; historical profile rows remain readable. Reused the pinned upstream Tantivy binding and
its published wheel hashes. Managed updates provision the dependency before replacing the CLI;
a missing binding never falls back to ripgrep.
