# Host app research in project HQ

Implemented the shared study validator, evidence viewer, and compact Appeeky snapshot command in MO-26-11-20-14.22.17. Darwin supplies the Evo catalog and gated Firebase reads. The shared repository contains synthetic fixtures only.

The pinned local Claude Factory worker on Christophers-MacBook-Pro.local implemented the core in run `11f892ca-841d-4d73-a242-796d8c9729f4` using Claude Opus 5.5 at Standard speed. Earlier setup runs stopped before producing changes. The rollout cohorts already had assigned tasks. The controller independently exercised both study bundles and adjusted the narrow viewport rankings layout and labels.

## Independent review

The initial review cleared with three minor notes. The controller corrected lazy deep-link loading, malformed rank responses, and the usage-endpoint wording. A fresh follow-up cleared the fixes, support for alternate screen captures, and the generated declaration ordering required by CI.

Native Claude Factory reviews ran on Christophers-MacBook-Pro.local in runs `628cc344-8f22-4d88-957c-0c221505b465` and `19e12868-5aa3-4daa-8bfb-e6688d2d5866` at Standard speed.

```morpheus-review
{
  "version": 2,
  "base": "886e4acb48b8468035439215f92f65fb083cc885",
  "reviewed": "e3795bfd2e4f859c71ffefa13fbeb571f88554cd",
  "covered": "d59457fadef373e7c5335c45031aa034b62679f4",
  "authorSession": "01a1f857-bca3-7942-803c-de87ee58fed8",
  "reviewerSession": "aff6f808-9da2-4abc-9170-a52a342c992a",
  "risk": "normal",
  "elapsedMinutes": 4.395066666666667,
  "timing": {
    "source": "clock",
    "durationMs": 263704,
    "evidence": "Factory run 628cc344-8f22-4d88-957c-0c221505b465 start 1795215116254, controller terminal observation 1795215379958, Unix milliseconds."
  },
  "outcome": "complete",
  "summary": "The initial review cleared with three minor notes. The controller corrected lazy deep-link loading, malformed rank responses, and the usage-endpoint wording. A fresh follow-up cleared the fixes, support for alternate screen captures, and the generated declaration ordering required by CI.",
  "contextRead": [
    "CLAUDE.md",
    "hq/product/roadmap/MO-26-11-20-14.22.17-host-app-research.md",
    "qa/acceptance/MO-26-11-20-14.22.17.md",
    "docs/runbooks/product-research.md",
    "architecture.md",
    ".agent/worklog/2026-11-20-host-app-research.md",
    "src/product-research/README.md"
  ],
  "findings": [
    {
      "id": "R01",
      "severity": "minor",
      "description": "A non-entry deep link triggered an entry screenshot read before the fragment restored.",
      "paths": [
        "src/product-research/react.tsx",
        "tests/product-research-react.test.tsx"
      ],
      "disposition": "fixed",
      "response": "The first render defers screenshot reads until fragment restore. A text-only deep link now asserts zero reads."
    },
    {
      "id": "R02",
      "severity": "minor",
      "description": "A successful lookup lacking a ranks array was reported as unranked.",
      "paths": [
        "src/product-research/appeeky.ts",
        "tests/product-research.test.ts"
      ],
      "disposition": "fixed",
      "response": "Treat the missing array as unchecked and test it alongside an empty, valid result."
    },
    {
      "id": "R03",
      "severity": "minor",
      "description": "The runbook did not establish that the usage endpoint was free.",
      "paths": [
        "docs/runbooks/product-research.md"
      ],
      "disposition": "fixed",
      "response": "Removed the cost claim and retained the credit preflight description."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "47110042-6ae5-483f-8efa-0ae2ce307fa8",
      "commit": "d59457fadef373e7c5335c45031aa034b62679f4",
      "scopeReason": "Real-data verification found unreachable alternate screenshots. The correction exposes every capture and handles a clean-build generated declaration diff required by CI.",
      "handoff": {
        "reason": "The Factory would not resume the initial terminal reviewer. The fresh reviewer received its findings and exact reviewed commit.",
        "findings": [
          "R01",
          "R02",
          "R03"
        ]
      },
      "outcome": "cleared",
      "elapsedMinutes": 1.5299,
      "timing": {
        "source": "clock",
        "durationMs": 91794,
        "evidence": "Factory run 19e12868-5aa3-4daa-8bfb-e6688d2d5866 start 1795215618654, controller terminal observation 1795215710448, Unix milliseconds."
      },
      "summary": "Confirmed the three minor fixes, capture selection and deep links, matching accessibility snapshots, the rendered desktop and 390px states, and reproducible generated files."
    }
  ]
}
```

