---
roadmap: MO-26-10-27-13.40.43
domains: [engineering, operations]
agents: [codex]
---

# Generalize Gemini meeting intake

## Outcome

Morpheus now owns the deterministic Gemini meeting-intake boundary: discovery metadata and
project-policy validation, source-identity deduplication, immutable Git reads, bounded search,
optional projection rendering and a completion-notice gate that formats but never sends. Project
profiles own people, Gmail sources, topics, canonical storage, optional projection, timezone and
explicit notification authority. The registered `meeting-intake` skill points both Codex/Grok and
Claude at one shared procedural guide.

Invented fixtures exercise Evo's Darwin-owned projected catalog and Lakina's same-repository
canonical notes without a projection. Historical imports are encoded as notes-only and cannot
pass the notice gate. The reader resolves an exact commit and ignores dirty checkout content;
source bodies never enter the generated catalog.

The extraction retains Node's argument-safe Git subprocess adapter. `simple-git` 4.0.2 was
considered (last published 2026-09-26, five direct dependencies), but the adapter remains small and
domain-specific enough that the dependency would add more surface than it removes.

## Validation

- `pnpm typecheck` — passed.
- `pnpm lint` — passed.
- `pnpm exec vitest run tests/meeting-intake.test.ts tests/project-skills.test.ts
  tests/package-manifest.test.ts tests/init.test.ts tests/cli-args.test.ts
  tests/cli-dispatch.test.ts tests/cli-check.test.ts --reporter=dot` — 261 tests passed.
- `pnpm compile` — passed and refreshed committed `dist/` artifacts.
- `pnpm morpheus pm index` — passed; all generated indexes were unchanged.
- `pnpm test -- --reporter=dot` — the single allowed local full-suite run passed all 3,438 tests
  across 122 files.
- The compiled CLI printed the shared guide, and a direct renderer comparison proved both
  canonical provider skill entrypoints exactly match the registered template.

## Tooling note

The current main graph had no recorded coverage gaps in the existing team schema, parser, CLI,
template, registry and test files. The task's new source, tests and roadmap record were not yet in
that main-branch generation, so they were read directly in full and verified through typecheck,
lint, focused tests, compiled CLI probes and the full suite.

## Independent review

Independent normal-risk review found three substantive boundary defects. All were fixed with regressions, and the same reviewer cleared correction commit f6622ed4338173facd1ace7ee3878569b1f1e7b4 with no new findings.

```morpheus-review
{
  "version": 2,
  "base": "9aeb74a619f31982aad89b78723cde03bfa2c8af",
  "reviewed": "a8da896b58498ada2af251bc1854db70cc37b18c",
  "covered": "f6622ed4338173facd1ace7ee3878569b1f1e7b4",
  "authorSession": "01a17f15-284b-7731-888a-14a5ef62d00f",
  "reviewerSession": "/root/meeting_intake_review",
  "risk": "normal",
  "elapsedMinutes": 3.0654833333333334,
  "timing": {
    "source": "clock",
    "durationMs": 183929,
    "evidence": "Author clock around /root/meeting_intake_review initial invocation: 2026-10-27T20:54:38.800Z to 2026-10-27T20:57:42.729Z (1793134478800 to 1793134662729)."
  },
  "outcome": "complete",
  "summary": "Independent normal-risk review found three substantive boundary defects. All were fixed with regressions, and the same reviewer cleared correction commit f6622ed4338173facd1ace7ee3878569b1f1e7b4 with no new findings.",
  "findings": [
    {
      "id": "MI-001",
      "severity": "substantive",
      "description": "Project topic policy was applied before project filtering, so an unrelated canonical note could break a projection.",
      "paths": [
        "src/meeting-intake/core.ts",
        "tests/meeting-intake.test.ts"
      ],
      "disposition": "fixed",
      "response": "Topic policy now runs only after project filtering, while schema, path, meeting-id and source-identity validation remain corpus-wide. A Darwin-only unknown-topic regression produces an empty Evo projection without failure."
    },
    {
      "id": "MI-002",
      "severity": "substantive",
      "description": "Repository-relative directories accepted backslashes and control characters, allowing a Windows projection path to escape the project.",
      "paths": [
        "src/meeting-intake/schema.ts",
        "src/meeting-intake/cli.ts",
        "tests/meeting-intake.test.ts"
      ],
      "disposition": "fixed",
      "response": "Directory syntax now permits only safe forward-slash path segments, with explicit project-root containment before projection reads and writes. Regressions reject forward-slash traversal, backslash traversal and newline input."
    },
    {
      "id": "MI-003",
      "severity": "substantive",
      "description": "Notification state was type-cast instead of parsed, so a string sent state could bypass repeated-send protection.",
      "paths": [
        "src/meeting-intake/core.ts",
        "tests/meeting-intake.test.ts"
      ],
      "disposition": "fixed",
      "response": "Notification state now requires an object with a known status. Only absent or pending state formats a notice; string, unknown, sending, sent and uncertain states all fail closed."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "/root/meeting_intake_review",
      "commit": "f6622ed4338173facd1ace7ee3878569b1f1e7b4",
      "outcome": "cleared",
      "elapsedMinutes": 0.6538833333333333,
      "timing": {
        "source": "clock",
        "durationMs": 39233,
        "evidence": "Author clock around the same-reviewer follow-up: 2026-10-27T20:58:28.775Z to 2026-10-27T20:59:08.008Z (1793134708775 to 1793134748008)."
      },
      "summary": "MI-001, MI-002 and MI-003 were cleared. The reviewer independently ran the 11 meeting-intake tests and direct safety probes, and found no regressions or new findings."
    }
  ]
}
```
