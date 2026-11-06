# Early visual planning

Before implementation, show a small diagram when relationships make a design clearer: architecture,
workflows/pipelines, async handoffs, state transitions, ownership or substantial alternatives.
Skip trivial self-contained edits. The maintained procedure is the `visual-design` skill, printed
by `morpheus skills guide visual-design`. This adds no approval pause or merge gate.

## Distribution and refinement

Edit `.agents/skills/visual-design/SKILL.md`, then run
`node scripts/sync-visual-design-skill.mjs` to refresh the Claude mirror and the generated CLI
module. Distribution tests compare all three byte for byte. `src/project-skills.ts` remains the
only registry. Descriptions in scaffold pointers come from the canonical frontmatter.

```mermaid
flowchart LR
  Canonical[Canonical agents skill] --> Sync[Skill sync script]
  Sync --> Mirror[Claude mirror]
  Sync --> CLI[Installed CLI guide]
  Registry[Project skill registry] --> Init[New-project pointers]
  Registry --> Existing[Missing-entrypoint sync]
  Guidance[Early-planning instructions] --> Scaffold[Scaffold AGENTS.md]
  Guidance --> Doctor[Doctor advisory for older projects]
```

This view describes the distribution implemented by this rollout. Skill sync adds missing
entrypoints; it does not rewrite existing instructions or existing skills. A CLI update refreshes
the shared guide, while consumer instruction adoption remains a reviewed project change.

## Existing-project rollout

After this Morpheus change merges, update the standalone installed CLI with `morpheus self update`.
Verify `morpheus skills guide visual-design` prints the canonical guide and
`morpheus skills list --json` lists `visual-design` for both providers and all three project kinds.
No runtime `morpheus-kit` dependency bump is needed for agent guidance.

For each registered project, claim its own rollout item under its delivery rules, then:

1. Run `morpheus skills sync` in its claimed checkout, followed by `morpheus skills sync --check`.
   Inspect the two `visual-design/SKILL.md` entrypoints. Existing files are preserved: reconcile a
   project-owned version explicitly when necessary rather than replacing it automatically.
2. Carry the **Plan visually early** paragraph from Morpheus's `AGENTS.md` into the project's
   authored instructions, adapting context while retaining early timing, task triggers, the guide
   command, trivial-edit exception, current/proposed and assumptions, showing the diagram, retained
   diagram updates and fenced Mermaid for durable docs. Preserve its `CLAUDE.md` convention.
3. Run `morpheus doctor --offline` and check the `early visual planning` instruction warning is
   absent. Doctor is an advisory discovery aid, not a semantic evaluation or new gate.
4. Use the project's tests, independent review, CI and PR merge path. The installed review contract
   already carries the advisory question. If it keeps a legacy `.github/agent-review-prompt.md`,
   carry that question over too, without adding a required diagram artifact.

Use the private registry (`morpheus registry list`) for target paths. Keep the inventory and
project-specific rollout status out of public Morpheus records. A missing or stale registry entry
is a discovery gap, not proof that a project is absent or that the rollout is complete.
