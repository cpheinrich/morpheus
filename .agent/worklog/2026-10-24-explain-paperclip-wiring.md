---
roadmap: MO-26-10-24-23.03.52
---
# Explain the Morpheus/Paperclip plumbing

Chris requested a succinct Markdown overview with architectural diagrams and a prominent
work-in-progress notice. Added `docs/paperclip-overview.md` and a docs index link, with three
Mermaid diagrams: deployment, one-to-many Git linkage and interactive provider turns.
No runtime, configuration or authority changed.

The overview distinguishes the committed operator job records from the private interactive
conversation store, Paperclip operational completion from Git delivery, and actual qualification
from future routing/consumer/simulator rollout. Existing pilot documentation describes an older
reverse-tunnel path; the current interactive path retains the Paperclip credential on the
controller and uses native host logins. This distinction is explicit rather than blending the
two implementations into an imaginary unified system.

## Evidence and validation

Graph Tier2 on primary checkout `Users-chrisheinrich-code-morpheus`, generation
2026-10-25T06:04:03Z, at f533aff805d30d9513b6d04f76e0af0beca713b7: narrow pool symbol
lookup returned seven matches, linkage prepare/operate two, both complete pages. Coverage for
pool.mjs, pool-runner.mjs, pool-host.mjs, bridge.ts and the three relevant existing docs reported
matching metadata and no recorded gaps (best-effort, not proof of completeness). Read exact
source for start, runTurn and prepare plus the graph's followup snippet; prepare's inbound trace
identified its CLI. Direct documentation reads supplied the qualification and rollout limits.

- `pnpm typecheck` — passed.
- `pnpm compile` — passed; no generated changes.
- `pnpm morpheus pm index` — unchanged derived indexes.
- `pnpm morpheus pm validate` — all331 roadmap items, goal and request files valid.
- `node /private/tmp/morpheus-paperclip-docs.ONRE3O/check-docs.mjs` — WIP notice present,
  six local links/anchors resolve and exactly three Mermaid diagrams parse/render in headless
  Chromium with Mermaid12.2.0. Opened all three resulting PNGs and inspected labels and arrows.
  The first pass exposed a semicolon parsed as a statement separator in the sequence diagram;
  replaced it with ordinary prose and the next pass rendered all three. The temporary renderer
  and its package install are outside Git; repository dependencies are unchanged.
- `git diff --check` — passed.

No Vitest or live model-task replay: this changes only prose and Mermaid, verified directly
above. Existing worker qualification is cited rather than rerun; CI still runs required checks.
The claim command also reconciled the already-merged placement-capture items
MO-26-10-24-21.07.10 and MO-26-10-24-22.06.12 to shipped as routine board bookkeeping.

## Independent review

Fresh independent reviewer cleared the documentation with no findings after checking the
implementation, local links and actual pixels of all three diagrams. Git linkage and
interactive delegation remain explicitly separate, and qualification limits are accurately
stated. No live worker or authentication replay was performed.

```morpheus-review
{
  "version": 2,
  "base": "f533aff805d30d9513b6d04f76e0af0beca713b7",
  "reviewed": "4fa36c60a110f9425f3382d8664ebfb4ae0d546a",
  "covered": "4fa36c60a110f9425f3382d8664ebfb4ae0d546a",
  "authorSession": "01a165f2-ad9a-7270-863f-355359913b8c",
  "reviewerSession": "/root/paperclip_docs_review",
  "risk": "small",
  "elapsedMinutes": 1.7483833333333334,
  "timing": {
    "source": "clock",
    "durationMs": 104903,
    "evidence": "Author captured Date.now()=1792908475424 immediately before spawning /root/paperclip_docs_review and Date.now()=1792908580327 upon receiving its final response: 2026-10-25T06:07:55.424Z through 06:09:40.327Z, including tool calls and waits."
  },
  "outcome": "complete",
  "summary": "Fresh independent reviewer cleared the documentation with no findings after checking the implementation, local links and actual pixels of all three diagrams. Git linkage and interactive delegation remain explicitly separate, and qualification limits are accurately stated. No live worker or authentication replay was performed.",
  "findings": []
}
```
