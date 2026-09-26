---
roadmap: MO-26-09-26-07.55.05
---

# Desktop startup and saved update consent

Reproduced on Chris's MacBook Pro: the login shell resolves /opt/homebrew/bin/morpheus,
self check matches main, and the device preference is enabled. The desktop non-login
PATH omits Homebrew; the old shim emits bootstrap-required without reading that preference.
Recovered the interrupted implementation from the archived chat and preserved its claim.

Session/bootstrap scripts append common tool locations, preserve the configured PATH's
precedence, and never source shell RC files. Saved yes/no and malformed state never produce
a new enable question. Recognized status/inspection failures still reach context brief.
Managed Git hooks add the installed CLI and Node directories in a subshell, preserving
surrounding hook state and their nonfatal update behavior. These are small Morpheus-specific
shell bridges using existing Node JSON parsing; no new generic module or dependency.

Validation: pnpm typecheck; pnpm test (51 files, 1,400 tests); pnpm compile;
pnpm morpheus pm index. Actual restricted-PATH startup resolves the installed CLI; the
offline probe reaches the expected context startup offline guard rather than bootstrap.

Graph MCP tools are not exposed in this runner. The operational check found no exact
checkout index. Trusted-device repair refused activation while other CBM sessions are
active; the local graph CLI also timed out. Used bounded source reads of bootstrap,
self-auto-update, context/install and their tests; no completeness claim.
