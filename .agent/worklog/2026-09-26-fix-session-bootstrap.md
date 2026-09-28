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

Independent normal-risk review found one substantive inaccessible-preference bug. The author replaced the shell existence check with an error-aware Node read and added an executed permission regression. The same reviewer cleared the fix; 33 focused tests passed, with generated-script equality and shell syntax verified. Graph tools were unavailable, so review used bounded source inspection.

Initial reviewer elapsed time is its approximately three-minute report; follow-up was measured.

```morpheus-review
{
  "version": 1,
  "base": "3b800b353b5caf7f71c1a830bd8eb6b69ad8d393",
  "reviewed": "8e5c8a33d5fbea13ba0eb830c9b143af4a50c912",
  "covered": "7bdf9d0210bf208902b09e8e774a72cf9be55246",
  "authorSession": "01a0dece-6432-7a33-a2d6-344151b22c52",
  "reviewerSession": "/root/review_startup_consent",
  "risk": "normal",
  "elapsedMinutes": 3,
  "outcome": "complete",
  "summary": "Independent normal-risk review found one substantive inaccessible-preference bug. The author replaced the shell existence check with an error-aware Node read and added an executed permission regression. The same reviewer cleared the fix; 33 focused tests passed, with generated-script equality and shell syntax verified. Graph tools were unavailable, so review used bounded source inspection.",
  "findings": [
    {
      "id": "R1-permission",
      "severity": "substantive",
      "description": "Shell -e mistakes inaccessible preference directories for absent saved consent and repeats the enable prompt.",
      "paths": [
        "src/session/bootstrap.ts"
      ],
      "disposition": "fixed",
      "response": "Read via Node unconditionally; only ENOENT is absence. Permission, parse and runtime failures remain diagnostics. Added chmod regression preserving disabled preference bytes."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "/root/review_startup_consent",
      "commit": "7bdf9d0210bf208902b09e8e774a72cf9be55246",
      "outcome": "cleared",
      "elapsedMinutes": 0.22,
      "summary": "R1 resolved. All 33 focused tests passed, including actual permission regression; generated script matches compiled source and passes shell syntax. No new findings."
    }
  ]
}
```
