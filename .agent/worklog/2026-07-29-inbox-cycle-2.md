---
date: 2026-07-29
agent: claude
outcome: shipped
summary: Second inbox cycle — five items settled, one architecture error corrected.
---

## The error worth recording

`architecture.md` specified "one GCP project per company" and used that as the boundary for
secrets scoping and the BigQuery rollup. Chris asked whether Darwin and Evo needed separate GCP
projects, which surfaced that the question is moot: **a Firebase project *is* a GCP project,
one-to-one.** Apps with separate user bases need separate Firebase projects, therefore separate
GCP projects. Not a design choice.

The correction improves the design — blast radius becomes one app rather than one company — but
it is worth noting *how* it was caught. I designed the boundary abstractly and it survived
several rounds of review, including my own. It fell over the first time someone asked a concrete
question about two real apps.

Same pattern as the template bugs found retrofitting Evo: the design was internally coherent and
externally wrong, and only contact with specifics revealed it.

## Settled this cycle

- Staying public with PolyForm Noncommercial — the deciding factor was sharing with friends
  without minting PATs, which is exactly what going private reintroduces. RM-012 dropped.
- Nimbalyst is a suggested editor, never a requirement. The property that makes this true is
  that validation runs in CI rather than the editor.
- Branch-as-claim locked in.
- Parallel sessions deferred until there is real friction to point at.

## Open

GCP project layout (confirm and I provision), PostHog org structure, and which Evo brand source
is canonical when `local/brand-research/` and `apps/web/app/brand` disagree.
