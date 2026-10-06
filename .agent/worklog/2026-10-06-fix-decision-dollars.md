---
roadmap: MO-26-10-06-11.47.48
date: 2026-10-06
---
# GitHub Manager decision files keep their dollar figures

Found during the scheduled ~12-hour watch of the GitHub Manager on Evo. Chris's correction on
darwin-health/evo#341 showed the manager's escalation had dropped `$` plus one digit from every
price. He suspected a `String.prototype.replace` with an interpolated replacement. I checked: no
`replace` call in `src/gh-manager/` takes interpolated replacement text, and the downloaded
`decision-341.json` artifact from ops run 37423690854 already contains `(29.99)`. The corruption
happened inside the session, which wrote the file through bash.

Fix: the session prompt's `## Decision file` section now tells the session to create the file with
its file-writing tool, never the shell, with the reason. A test pins the instruction. I confirmed
that the test fails against the old prompt.

Dead end: an apply-side guard. A lost `$4` leaves valid JSON and plausible prose, so there is
nothing to detect.

Also seen, not fixed here: the ops workflow's 16:17 UTC scheduled run on 2026-10-06 never fired.
The workflow is active, and the only runs are the two manual dispatches at about 06:12 and 06:26 UTC.
GitHub's cron is best-effort; watch whether the 04:17 run fires before treating it as a defect.

## Independent review

One fresh reviewer session reviewed 670d1a5 at small risk and cleared it with no findings: the instruction renders literally inside the template literal, the session can use its Write tool because nothing restricts tools, and the test pins the instruction under the Decision file heading.

```morpheus-review
{
  "version": 2,
  "base": "337b0cdff72a17905295edc6eb647aabdbf3c6b3",
  "reviewed": "670d1a54bcd16b61fffc1e86ce5f007235229469",
  "covered": "670d1a54bcd16b61fffc1e86ce5f007235229469",
  "authorSession": "27eae6da-fbd7-435d-a5ed-0ed0c3b55db2",
  "reviewerSession": "a8b60329eaf21724e",
  "risk": "small",
  "elapsedMinutes": 0.61285,
  "timing": {
    "source": "runner",
    "durationMs": 36771,
    "evidence": "Agent tool result for reviewer agent a8b60329eaf21724e: duration_ms=36771."
  },
  "outcome": "complete",
  "summary": "One fresh reviewer session reviewed 670d1a5 at small risk and cleared it with no findings: the instruction renders literally inside the template literal, the session can use its Write tool because nothing restricts tools, and the test pins the instruction under the Decision file heading.",
  "findings": []
}
```
