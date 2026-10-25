---
date: 2026-10-25
agent: codex
roadmap: MO-26-10-25-03.01.09
tags: [engineering, devops]
outcome: research
summary: Define reusable DevOps responsibility and subject tags in Morpheus records.
---

# DevOps skill and work tags

Chris authorized a DevOps skill like the existing CTO/research-engineer skills and
multiple subject tags on roadmap items and worklogs. A later clarification makes
Morpheus's own file records the first-class contract, with Paperclip mapping optional
later. This is source preparation; the regular TestFlight repair has priority.

The bounded check of the workforce-design chat and current `b0906f2e` source found
Paperclip worker/document integration, while the current roadmap/worklog schemas
have no tag field. No Paperclip schema, database, runtime or other chat files are
changed here. Graph generation `2026-10-25T09:31:59Z` and exact source reads cover the
PM/schema and CTO guide/distribution seams; coverage is best effort.

Design: optional open-vocabulary lowercase slug arrays, no historical mass rewrite;
explicit multiple-tag AND retrieval of roadmap/worklog records. Existing untagged
records stay valid and no role gains execution authority through metadata. Existing
Zod/frontmatter/Node APIs already own these Morpheus-specific fields and reads, so
no generic tag package is needed. The DevOps skill uses the existing guide path;
it records what a supervisor should own without claiming a supervisor was deployed.

Validation and independent behavioral evaluation are pending. No implementation
push, CI, review, merge, deployment or runtime acceptance is claimed.

## Local validation

- `pnpm typecheck` and `pnpm lint` pass; `pnpm compile` regenerates the committed guide,
  CLI/schema and scaffold output. `pnpm morpheus pm index` reports all indexes unchanged.
- Final tag/guide/dispatch/argument/block focused scope passed258 tests. The later scaffold
  context-size correction passed129 tests across agent instructions, skill distribution and init.
- The one permitted local `pnpm test` run found3049 passes and one failure: the new tagging
  paragraph exceeded the scaffold's16000-byte startup budget. Kept that ceiling, compressed
  existing claim/worklog wording without dropping its rules, and reran only those affected tests.
  The full suite has not been rerun; final CI is still required.
- Three implementation mutants (remove tag uniqueness, use OR rather than AND, drop block tags)
  each failed the new tests through actual assertion failures. Originals were restored; logs
  remain in ignored `local/devops-mutations/`.
- The real repository query returns this ticket and worklog, no issues, and307 unclassified
  historical worklogs. Earlier attempts wrongly applied today's JournalEntry shape to old prose
  records; a retained regression now keeps those unclassified without rewriting their contents.
- Skill-creator's real `quick_validate.py` passes with PyYAML6.0.3 installed only into ignored
  `local/skill-validation/python`. The system and bundled Python initially lacked PyYAML; no
  global package or pinned runtime was changed. The regular skill mirror/guide tests also pass.

`qa/acceptance/devops-work-tags-scenarios.json` supplies eight read-only behavioral cases and the
separate Markdown rubric. Independent behavioral evaluation, source review, publication funding,
actual CI and protected merge remain pending; these local tests do not prove unattended delivery.
The coordinator also supplied the observed repeated-native-resume/unchanged-funding-blocker lesson:
cheap capability checks should avoid repeating full model reasoning until there is new evidence
or a genuinely different bounded diagnostic. No V2 runtime/backoff implementation is claimed.

## Independent evaluation and source review

The fresh independent skill evaluator exercised all eight supplied read-only scenarios before source
review; the coordinating lead graded8/8 decisions and zero critical failures against the separate
rubric. Its actual responses distinguish unchanged inputs from missed releases, existing ownership,
quota uncertainty, uncertain uploads, observer failures and internal acceptance. This is synthetic
decision evaluation only. Its wall-clock start was not captured, so no duration or performance
claim is made. No operational action occurred in that evaluation.

Initial draft CI run40184265279 passed on exact sourcebf7959ac: six successful checks, with the
unlabelled-draft conventions and disabled legacy review checks intentionally skipped. Node/full
suite, browser QA, bridge tests and artifact ABI all succeeded. Draft skips are not independent
review. One fresh source reviewer inspected implementation, generated mirrors, tests, actual CI,
ticket/acceptance and all actual forward-evaluator responses. Its additional focused run passed224
tests. It found no substantive/incidental issue and one minor help grouping issue; the source and
its generated help were corrected and inspected after compilation. No follow-up turn was needed.

Independent source review cleared the DevOps skill and subject tags with one minor help-layout finding, now fixed within its named paths. Initial exact-head CI passed and all eight independent read-only skill scenarios passed; these are source and synthetic decision evidence, not deployed supervision.

```morpheus-review
{
  "version": 2,
  "base": "b0906f2ed944105689333eac1525a583065316a1",
  "reviewed": "bf7959ac9aa3fe97fe694f3fce3324a84f2cfc8a",
  "covered": "75fecc596cf63000c08718dde4090f3deb102b42",
  "authorSession": "01a1572f-2ae1-77f2-be54-4265b3baca43",
  "reviewerSession": "/root/devops_skill_and_tag_design/devops_source_review",
  "risk": "high",
  "elapsedMinutes": 3.4159,
  "timing": {
    "source": "clock",
    "durationMs": 204954,
    "evidence": "Author clock observed immediately before fresh reviewer invocation at2026-10-25T10:24:33.119Z and upon its terminal response at2026-10-25T10:27:58.073Z; canonical task /root/devops_skill_and_tag_design/devops_source_review. Includes tools and waits; no active-only inference."
  },
  "outcome": "complete",
  "summary": "Independent source review cleared the DevOps skill and subject tags with one minor help-layout finding, now fixed within its named paths. Initial exact-head CI passed and all eight independent read-only skill scenarios passed; these are source and synthetic decision evidence, not deployed supervision.",
  "findings": [
    {
      "id": "DEV-001",
      "severity": "minor",
      "description": "The pm tagged usage line split pm new from its --slug/--issue continuation, making those options appear to belong to tagged lookup.",
      "paths": [
        "src/cli/help.ts",
        "dist/cli/help.js",
        "dist/cli/help.js.map",
        "dist/cli/help.d.ts"
      ],
      "disposition": "fixed",
      "response": "Moved pm tagged below the complete pm new block in75fecc596cf63000c08718dde4090f3deb102b42, ran pnpm compile and inspected the actual pnpm morpheus --help output. Only three of the four named source/generated paths changed; source map remained identical. Reviewer explicitly required no new test for the static ordering correction."
    }
  ]
}
```
