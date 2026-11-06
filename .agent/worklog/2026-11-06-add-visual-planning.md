---
date: 2026-11-06
roadmap: MO-26-11-06-13.35.21
tags: [engineering, documentation, agent-workflow]
---
# Early visual planning

Implemented the approved Morpheus-only phase: a small canonical visual-design skill and Claude
mirror, generated installed guide, registry-driven provider pointers, early scaffold/Morpheus
instructions, an advisory doctor warning and an advisory review question. Existing skill sync
continues to preserve authored files. No diagram artifact gate or approval pause was introduced.
No consumer repository was changed. The private registry inventory stays in ignored handoff state.

The simplest design reused the CLI dispatcher, single project-skill registry, scaffold template and
existing instruction-drift advisory. A small synchronization script derives exact canonical bytes
for the CLI and Claude, following the existing guide/pointer convention. No new dependency or
generic module; no second catalog. The early conversation sketch showed the proposed distribution
before source edits. The retained Mermaid in docs/visual-planning.md describes the implemented
relationships; existing-project AGENTS adoption is explicit because skills sync never rewrites it.

## Validation and limits

- Initial targeted distribution run exposed stale catalog/count fixtures and a too-short doctor
  anchor. Corrected these; 22 focused distribution/doctor tests passed.
- Expanded focused run: `pnpm exec vitest run tests/visual-design-skill.test.ts
  tests/project-skills.test.ts tests/doctor-instructions.test.ts tests/init.test.ts
  tests/doctor.test.ts tests/local-review.test.ts tests/review.test.ts` — 366 passed.
- One permitted local `pnpm test`: 4,334 passed and two startup-context budget assertions failed.
  The new guidance had pushed root/scaffold over 20,000/16,000 bytes. Shortened the new paragraph
  and existing duplicate registry/review summaries, preserving linked contract detail. Final root
  is 19,980 bytes and representative company scaffold 15,983 bytes. The full suite was not rerun
  locally; CI must run it on final source.
- Final affected checks: `pnpm exec vitest run tests/agent-instructions.test.ts
  tests/visual-design-skill.test.ts tests/project-skills.test.ts tests/doctor-instructions.test.ts
  tests/init.test.ts tests/doctor.test.ts` — 141 passed. The shortened scaffold required updating
  three wording assertions while preserving their review/timing invariants.
- `pnpm typecheck`, `pnpm compile`, `pnpm morpheus pm index` and `git diff --check` passed.
  Complexity passed in advisory mode: 34 targeted functions, 183 functions in 12 measured files;
  CCN limit/cognitive advisory 15, no findings, dist excluded, 13 Markdown files unmeasured.
  Manually inspected the guide dispatcher, pointer renderer, registry entry and instruction anchor.
- `quick_validate.py .agents/skills/visual-design` passed through `uv run --with pyyaml` using a
  task-local cache; the system Python initially lacked PyYAML. No project dependency was added.
- The compiled CLI prints the complete guide and `skills sync --check` reports 17 discoverable
  internal-project entrypoints. Byte equality tests exercise both provider files, the generated
  guide, descriptions, every scaffold kind, idempotent sync and preservation of authored content.

Distribution assertions establish delivery separately from the bounded synthetic behavior results
below. The author supplied an early conversation sketch before implementation; independent gateway
runs then exercised the representative cases without an explicit request for a diagram.

## Discovery evidence

The graph MCP transport was closed in this worker. The installed pinned CLI indexed this exact
checkout; graph project is the worktree-qualified name ending in primary-morpheus-2a833af0,
initial generation 2026-11-06T21:35:33Z. CLI search found the six symbols in src/cli/skills.ts
with complete pagination, and inbound trace found syncProjectSkillEntrypoints calling
syncProjectSkills. Coverage was best effort with no recorded gap but metadata_changed after edits;
material modified source was read directly rather than treating the stale graph as proof.
Context reads were not credited through this tool bridge; after reading the required records,
refresh used the documented MORPHEUS_READ_EVIDENCE=off assertion escape and recorded that fact.

## Independent review

Draft PR: https://github.com/cpheinrich/morpheus/pull/633 (created through the GitHub app tool).

Independent gateway review cleared the exact implementation commit with no findings. The reviewer passed 114 focused tests, typecheck and diff checks, and confirmed the retained distribution diagram matches the source. No fixes, disagreement or follow-up were needed. Rendered pixels were not inspected; no application UI changed.

```morpheus-review
{
  "version": 2,
  "base": "96e3c360b69e96d2d9c2f4449f57dd387b1521f0",
  "reviewed": "13c12083f8c8e8e56498fbf6e57928bd4b35da57",
  "covered": "13c12083f8c8e8e56498fbf6e57928bd4b35da57",
  "authorSession": "01a1b2c8-ad52-7820-b7cd-ae613d70d32e",
  "reviewerSession": "01a1b2d2-7d11-7140-a98f-4b45b78bfcde",
  "risk": "normal",
  "elapsedMinutes": 1.2469333333333332,
  "timing": {
    "source": "runner",
    "durationMs": 74816,
    "evidence": "Factory gateway run 552a2d33-5cf0-42bb-b342-fb4c7b5c96cc; Codex session 01a1b2d2-7d11-7140-a98f-4b45b78bfcde, turn 01a1b2d2-7fa6-70e1-926b-e25a8d0bf470 task_complete event: duration_ms=74816. Supervisor inspected native transcript task_started/task_complete boundaries."
  },
  "outcome": "complete",
  "summary": "Independent gateway review cleared the exact implementation commit with no findings. The reviewer passed 114 focused tests, typecheck and diff checks, and confirmed the retained distribution diagram matches the source. No fixes, disagreement or follow-up were needed. Rendered pixels were not inspected; no application UI changed.",
  "findings": []
}
```

## Bounded behavioral evaluation

Five actual synthetic requests passed their observable acceptance checks under gateway Codex.
Supervision retained the complete outputs privately and inspected them; this author inspected the
returned outputs and timing evidence before recording them. The reviewer was a separate session.

| Case | Observed result | Factory run |
|---|---|---|
| Move image processing to a background worker | Current/proposed sequence diagrams appeared early, with assumptions and durable handoffs. | ebe21d8a-8f4d-487c-b764-29de0f7b6718 |
| Correct one spelling error | Returned the corrected sentence with no diagram or approval pause. | b26fe0de-600c-4ce4-be54-b822b9ac9c88 |
| Release pipeline | Early flowchart distinguished upload acceptance from asynchronous availability readback and failures. | 80db1d1a-f01d-401a-9496-1848e5cfae9f |
| Cancellation model | Proposed state diagram distinguished requested cancellation, confirmed stop, failure and success, with race semantics. | ad0aa0c1-e381-4d00-adbc-f21c574c72f1 |
| Change callback design to polling | Resumed the architecture session, replaced the diagram and removed callbacks from the final proposed design. | 5428849c-8b9f-4bdd-bc38-648665561b8e |

Limits: synthetic planning-only tasks performed no implementation or external effects. They prove
observed planning responses for these cases, not reliable automatic routing or production compliance.
Rendered pixels were not verified. Some global guide probes failed because the installed CLI
predated this PR; workers read the canonical source as directed. One isolated compiled-CLI probe
also lacked dependencies. Complete context certification was not established in some planning
runs because their combined record output was truncated. Independent code review used exact-SHA
source, focused tests and typecheck; these evaluation limits do not claim additional review coverage.
