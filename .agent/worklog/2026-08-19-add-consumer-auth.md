---
agent: claude
date: 2026-08-19
roadmap: MO-26-08-19-00.39.34
outcome: shipped
summary: morpheus web add-consumer-auth — Evo's consumer accounts as a four-layer scaffold with its runbook.
---

# Consumer-auth scaffold

Second slice of cpheinrich/morpheus#135 (after #136's CI workflow and manifest fields).

## What was done

- Templates extracted mechanically from Evo's files rather than transcribed: a script escaped
  each source for a template literal and substituted every Evo-specific value
  (`evo.med`, `cph-evo`, API keys, `evoActionLink`, `evo_signed_in`, …) with `${ctx.*}`
  references. Rendering with Evo's own values then reproduced 52/52 files byte-identically —
  proof by construction, before any hand edit.
- Hand edits afterwards, all comment generalisations where an Evo-only fact was cited
  (`hq/brand/application.md`, `.agent/learned.md` indexing woes, "Warm Spectrum"), plus two E2E
  assertions on Evo's marketing header moved into comments — a scaffolded suite must be green on
  day one, and the header the assertions need does not exist until `<NavAuth />` is wired.
  Final: 47/52 byte-identical, 5 with exactly those deltas.
- `scaffoldConsumerAuth`: never overwrites; shared files that exist with different content are
  reported as drift with delete-and-re-run guidance (web init's own recovery pattern). Rules
  merge anchors on the same catch-all comment as the waitlist block — `CATCH_ALL` is now
  exported from web/scaffold.ts rather than duplicated. `--check` diffs the plumbing and policy
  layers only; starter pages are project-owned and suites get extended in place.
- Root scripts pin every `emulators:exec` to the *staging* project id. Evo's `test:emulator`
  wrapper names the production id (harmless — the id only matters where keyed data crosses the
  seam, which is E2E); the template deviates deliberately so nothing in a generated project is
  one typo from naming production.

## Learned / dead ends

- Evo's `safe-next.ts` contains raw control characters in a regex character class. Faithful
  extraction keeps them, which makes `templates-lib.ts` read as binary to grep (`grep -a` works).
  Considered rewriting as `\x00`-escapes; rejected — it would break byte-identity for a purely
  cosmetic gain.
- Evo's mail provider is Resend, but the standing decision (2026-08-01) names Cloudflare Email
  Sending as canonical transactional email. Shipped the extracted-and-verified Resend
  implementation behind the `deliver()` seam and flagged the conflict in the runbook and the PR's
  open questions rather than swapping to an untested provider inside a faithfulness-focused PR.
- The `web init` templates for the same files (session route, config, gate) are HQ-only and now
  have a consumer-shaped successor. Folding the two together — one template set with a consumer
  flag — was considered and deferred: it would have touched every existing `web init` consumer in
  the same PR that introduces 6,000 lines of new templates.
