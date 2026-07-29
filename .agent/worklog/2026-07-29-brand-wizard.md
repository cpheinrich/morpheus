---
date: 2026-07-29
agent: claude
roadmap: MO-014
outcome: shipped
summary: Brand wizard, GCP projects created, and a bad diagnostic worth remembering.
---

## The mistake worth recording

Creating GCP projects, I reported `dh-evo`, `evo-med`, `darwin-app`, and `evo-app` as "already
taken" based on grepping for `^ERROR`. Three of those were probably available — the real error
was **"project display name must be at least 4 characters"**, because I was passing "Evo".

The lesson is narrow and general: **classifying a failure by matching on the presence of an
error, rather than by reading it, invents a diagnosis.** I reported a fact ("taken") that I had
not actually established, and it would have led Chris to pick worse ids for no reason.

Second-order: `gcloud projects list` returned stale results for minutes after both creation and
deletion. `gcloud projects describe` was authoritative. Do not trust the list command to confirm
a mutation.

## Built

`morpheus brand init` — eight questions writing a complete `hq/brand/`. The design constraint
that shaped it: **nothing emits a TODO.** A skipped optional question produces an absent section
rather than an empty heading, because a heading with nothing under it reads as answered when it
is not. There is a test asserting no output matches `TODO|TBD|FIXME|{{`.

The `never` question — what must this never feel or sound like — is required. It is the only
question whose answer an agent cannot infer from the others, and it is what stops positioning
drift.

## Note

Two projects created under the `darwin.health` organization (`dh-darwin`, `dh-evo`); the old
`darwin-health-503300` and an auto-created `evident-door-503300-s6` are in the 30-day deletion
window. **No billing account exists yet**, which blocks Firebase Blaze and Cloud Run.
