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

These are distribution assertions, not measured agent compliance. The acceptance file contains
architecture, pipeline, state, trivial-edit and changed-design cases. The author's early sketch
is one observed planning artifact, not independent behavior evidence. A fresh gateway evaluation
must execute representative cases and retain actual outputs/order before claiming behavior passes.
This worker cannot launch another agent or recursively invoke Factory under its delegated run
instructions. Codex must launch the fresh independent gateway reviewer and evaluation, then return
findings and real session/timing evidence. No self-review record, agent-reviewed label or auto-merge
has been fabricated. This is a review handoff, not a request for new human authorization.

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

Pending a fresh gateway reviewer launched by Codex, because this worker run prohibits launching
another agent. PR remains draft with auto-merge off. Review record belongs here after real findings,
runner session identity and measured timing are available.
