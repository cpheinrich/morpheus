---
agent: codex
date: 2026-08-13
roadmap: MO-26-08-13-16.24.31
outcome: completed
---

# Scaffold organic social channels

## What changed

- Added non-destructive Instagram, LinkedIn, X, and Reddit operating records to every company and
  personal project scaffold, including public account fields and channel-specific creation,
  measurement, and automation guidance.
- Grounded the guidance in current official platform sources rather than applying one generic
  social playbook to four different distribution systems.
- Expanded the marketing root and architecture into a virtual AI CMO loop that connects SEO, ASO,
  GEO/AI visibility, social, community, market/competitor research, and live analytics.
- Extended doctor and initializer coverage so missing channels are visible, established records are
  preserved, and internal projects remain exempt.

## Research and boundaries

Instagram's official recommendation guidance emphasizes original, eligible content and Account
Status; LinkedIn emphasizes professional relevance and useful insight; X emphasizes concise,
conversational, media-aware participation; Reddit requires community-specific, authentic
participation and explicitly prohibits repetitive or automated spam. The scaffold therefore
adapts work per channel and defaults scripts to research, metrics, drafts, validation, and dry-run
queues. It does not grant permission to publish, reply, message, create accounts, or manufacture
engagement.

## Verification

- Focused initializer and doctor suite: 86 tests passed.
- Full Vitest suite: 868 tests passed.
- TypeScript typecheck passed.
- Production compile, PM validation, PM index regeneration, and whitespace validation passed. The
  documented `pnpm build` command does not exist in `package.json`; the repository's actual build
  script is `pnpm compile`, which passed.

## Learned

A social folder is most useful before an account exists: the blank public identity fields expose
the setup decision without turning account creation into an initializer side effect. Platform
guidance also needs a review date because distribution behavior and automation terms are live
dependencies, not stable architecture.
