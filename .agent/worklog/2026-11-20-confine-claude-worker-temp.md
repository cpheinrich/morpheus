---
date: 2026-11-20
roadmap: MO-26-11-20-16.24.16
tags: [engineering, devops, factory]
---

# Keep Claude worker temporary files inside the sandbox

The restricted macOS Fleet worker failed before reaching its gateway because Claude Code
used its own temporary directory. Point its internal temp setting at the existing private
worker temp. The existing sandbox and its authenticated relay retain their policy.

An isolated run of the signed CLI under the Fleet execution identity reproduced the
startup failure against a synthetic local endpoint. With the patch, the same CLI
created its internal directory under the private sandbox root and returned a session
initialization and completed result through the restricted relay. The extended
macOS sandbox regression verifies an inherited temp override is replaced while
protected Git writes and direct gateway access remain blocked.

## Independent review

The independent reviewer cleared the exact candidate with no findings after checking the scoped temp environment, preserved write and network boundaries, regression assertions, Git blobs, syntax, and an unrestricted smoke check. The worker could not access the live draft body or run the nested macOS sandbox. The supplied exact-candidate packet included the author-host focused and real signed-CLI evidence. Live production qualification remains the deployment step.

```morpheus-review
{
  "version": 2,
  "base": "c39ea6253931464c5a3521ba4c405eee14fd8e59",
  "reviewed": "23290469d1f8375370863ae671b4e2eb12947350",
  "covered": "23290469d1f8375370863ae671b4e2eb12947350",
  "authorSession": "01a1edd7-8c88-7a62-a255-cbc13c753532",
  "reviewerSession": "01a1fb85-4b27-70b2-8fb8-0d5ab787e276",
  "risk": "normal",
  "elapsedMinutes": 3.463983333333333,
  "timing": {
    "source": "runner",
    "durationMs": 207839,
    "evidence": "Fleet run 1327944b-dc19-4425-89b6-679ff76a8007, admission 51b073a5-fa56-4512-929a-20d78b08c672, verified launch and termination. Private verdict SHA-256 55346e7905597f36692d0731a7cd224b1ce49e2329ca6372cf4bcf9322b345db."
  },
  "outcome": "complete",
  "summary": "The independent reviewer cleared the exact candidate with no findings after checking the scoped temp environment, preserved write and network boundaries, regression assertions, Git blobs, syntax, and an unrestricted smoke check. The worker could not access the live draft body or run the nested macOS sandbox. The supplied exact-candidate packet included the author-host focused and real signed-CLI evidence. Live production qualification remains the deployment step.",
  "contextRead": [
    "AGENTS.md",
    "morpheus.json",
    ".agent/context-core.md",
    ".agent/decisions.md",
    "architecture.md",
    "docs/runbooks/independent-review.md",
    "docs/runbooks/test-quality.md",
    "docs/runbooks/context-freshness.md",
    "hq/product/roadmap/MO-26-11-20-16.24.16-confine-claude-worker-temp.md",
    ".agent/worklog/2026-11-20-add-claude-fleet-workers.md",
    ".agent/worklog/2026-11-20-confine-claude-worker-temp.md",
    "plugins/factory/README.md"
  ],
  "findings": []
}
```
