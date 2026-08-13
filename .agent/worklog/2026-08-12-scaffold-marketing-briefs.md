---
agent: codex
date: 2026-08-12
roadmap: MO-26-08-12-17.03.52
outcome: completed
---

# Scaffold marketing initialization briefs

## What changed

- Generalized Evo's OpenSEO/Search Console strategy, privacy-bounded PostHog setup, and staged
  soft-launch plan into three project-owned initialization briefs.
- Kept launch planning broader than SEO: the website plan lives at `hq/marketing/launch-plan.md`,
  with a deliberately inert app-launch placeholder until a real store surface exists.
- Made `morpheus init` add missing briefs to company and personal projects without overwriting any
  existing strategy or operating record; internal projects remain exempt.
- Extended onboarding and doctor so a copied scaffold cannot be mistaken for completed setup.

## Verification

- Focused initializer, doctor, and onboarding suite: 110 tests passed.
- Full serial Vitest suite: 872 tests passed.
- TypeScript typecheck and build passed.
- `morpheus pm index` regenerated the roadmap indexes; `git diff --check` passed.

## Learned

The durable launch-plan boundary is marketing, not SEO. Website search is one launch channel, while
community participation, owned distribution, external-action approval, measurement, and a future
app-store launch cross that folder boundary. Keeping the plan at the marketing root avoids teaching
projects that every launch is an SEO campaign.
