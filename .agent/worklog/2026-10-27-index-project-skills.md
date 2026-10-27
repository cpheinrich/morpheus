---
roadmap: MO-26-10-27-13.11.05
domains: [engineering, agents]
agents: [codex]
---

# Reusable project-skill discovery and sync

## Outcome

Morpheus now has one typed registry for reusable project-facing skills. The registry drives new
scaffolds, human and `morpheus-project-skills-1` JSON catalog output, and idempotent sync/check for
established projects. Catalog descriptions come from rendered `SKILL.md` frontmatter. Existing
project-owned files are validated but never overwritten; exclusive creation also preserves that
guarantee if another process creates an entrypoint during sync.

The design deliberately does not add a `morpheus-skills.json` to each project. The local
`.agents/skills/` and `.claude/skills/` entrypoints are already the indexes their loaders read, so
syncing those entrypoints makes each capability directly discoverable without another list to
maintain. A classification test compares both canonical Morpheus skill directories with the
registry and the explicit Morpheus-only set. A future canonical skill that is not classified, or
whose provider entrypoints disagree with its registration, fails CI.

## Validation

- `pnpm typecheck` — passed.
- `pnpm vitest run tests/project-skills.test.ts tests/agentic-cto-skill.test.ts tests/init.test.ts`
  — 125 tests passed.
- `pnpm exec eslint src/project-skills.ts src/cli/skills.ts src/init/index.ts
  src/init/templates.ts src/cli/dispatch.ts src/cli/help.ts tests/project-skills.test.ts` — passed.
- One local `pnpm test` full-suite run found the scaffolded-instructions byte-budget guard after a
  proposed explanatory section made every generated `AGENTS.md` too large. The section was removed:
  loader-native entrypoints provide discovery without spending startup context. The targeted
  correction run, `pnpm vitest run tests/agent-instructions.test.ts tests/project-skills.test.ts`,
  passed 24 tests. Per the one-full-suite rule, CI owns the final full-suite rerun.
- `pnpm compile` and direct `pnpm morpheus skills list --json` / `skills sync --check` smoke checks
  passed; the latter found all nine entrypoints expected in Morpheus's internal project.

## Tooling note

The existing primary-checkout codebase graph supplied current structural evidence for the
scaffold, CLI dispatch, guide and generated skill paths. The task worktree's exact-checkout graph
check could not certify the unmerged branch because the installed CLI only certifies current main;
changed and new files were read directly and covered by TypeScript, focused tests and lint.

## Independent review

Independent normal-risk review found one substantive concurrency race and conditionally cleared an atomic no-clobber publication fix; the focused regression, typecheck, compile and compiled concurrent smoke probe all passed, with no other findings.

```morpheus-review
{
  "version": 2,
  "base": "f094873b404ec9377173ed8bb80a71a850da3f65",
  "reviewed": "de02a963a15b28c5e1ee6563320aaaa144b2982b",
  "covered": "3a24fcf4569b5c7b8530e827dcb084df9d0189df",
  "authorSession": "01a17efa-127f-7470-a66d-b636e2c4db32",
  "reviewerSession": "/root/morpheus_skill_catalog/morpheus_skill_registry_review",
  "risk": "normal",
  "elapsedMinutes": 2.5441333333333334,
  "timing": {
    "source": "clock",
    "durationMs": 152648,
    "evidence": "Author clock immediately before spawn: 2026-10-27T20:21:59.060Z (1793132519061 ms); immediately after reviewer completion: 2026-10-27T20:24:31.709Z (1793132671709 ms)."
  },
  "outcome": "complete",
  "summary": "Independent normal-risk review found one substantive concurrency race and conditionally cleared an atomic no-clobber publication fix; the focused regression, typecheck, compile and compiled concurrent smoke probe all passed, with no other findings.",
  "findings": [
    {
      "id": "PSR-001",
      "severity": "substantive",
      "description": "Concurrent syncs could let the EEXIST loser read the winner's final path while writeFile was still filling it, falsely reporting missing frontmatter.",
      "paths": [
        "src/project-skills.ts"
      ],
      "disposition": "fixed",
      "response": "Sync now writes and closes a unique same-directory inode, then publishes it through an atomic hard link that fails rather than replacing an existing path. The losing sync reads only an already-complete published inode.",
      "condition": {
        "paths": [
          "src/project-skills.ts",
          "tests/project-skills.test.ts",
          "dist/project-skills.js",
          "dist/project-skills.js.map",
          "dist/project-skills.d.ts"
        ],
        "evidence": "Add a two-sync regression requiring zero issues and full created-or-present accounting for both invocations; run the focused project-skills test, typecheck, compile, and a post-build concurrent smoke probe with zero issues for both results."
      },
      "conditionMet": "Commit 3a24fcf4 changes only the reviewer-authorized source, test and generated paths. project-skills passed 11/11; typecheck and compile passed. The compiled dist smoke ran two internal-project syncs concurrently and both returned issues: [] while each accounted for all nine expected paths as created or present."
    }
  ]
}
```
