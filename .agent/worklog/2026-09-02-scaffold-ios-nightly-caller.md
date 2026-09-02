# 2026-09-02 — Scaffold the iOS nightly TestFlight caller

Item: MO-26-09-02-15.57.44

## Why now

Kairos spent four failed nightly runs rediscovering the cross-repository
environment-secret constraint, finishing forty minutes after #193 landed the fix
for it in this repository. Two projects, the same discovery, a day apart. The
knowledge existed and had nowhere to live that a new project would encounter it.

The same is true of the schedule. Evo and Kairos both ran `17 3 * * *` — a time
neither had a reason for, that had to be changed in two places once a standard
was agreed.

## What was rejected

**Putting the schedule in the reusable workflow.** This was the first thing
asked for, and it cannot work: GitHub only honours the `on:` block of the
workflow that starts a run. `ios-nightly-build.yml` is `on: workflow_call`, so a
`schedule:` added to it would be inert. Callers must own their trigger. What can
be centralised is the *file they start from*, which is what this does.

**A Morpheus-owned scheduler dispatching each project nightly.** This would put
the time genuinely in one place. It needs a PAT or GitHub App with workflow-write
on every project, which inverts the trust direction — Morpheus currently needs no
credential in any consumer — and it breaks change detection, because
`force-build: github.event_name == 'workflow_dispatch'` means every dispatched
run would skip the watched-path check and build unconditionally. Rejected as far
more machinery than a shared starting file.

**Plausible defaults for the app-specific values.** A guessed team id or bundle
id fails deep inside signing with a message about certificates, long after the
point where a `TODO` would have failed loudly.

## The judgement call worth flagging

The schedule ships **commented out**, so a scaffolded project releases only on
manual dispatch until someone uncomments it.

Against: it means `init` does not actually produce a nightly build, which is
arguably the whole point of the template.

For: a fresh project has no `testflight-internal` environment and no signing
secrets, so a live cron fails every night until it does. `ci` already refuses to
wire `node-ci` into a repository with no pnpm lockfile for exactly this reason,
and the comment there says why: a scaffold whose CI is red on day one teaches
people to ignore red CI. Shipping a cron that cannot succeed would contradict a
rule this codebase states three separate times.

The canonical 06:00 value is still present in the file, which is what stops the
next project inventing its own time.

## Verified

`tsc --noEmit` clean. 272 tests pass across `workflows`, `init` and `check`.

The existing "callers match what they call" test now renders the iOS template
and checks it too, so every `with:` key the scaffold passes is verified against
the reusable workflow's declared inputs. That guard is the reason to put the
template here rather than in documentation: prose cannot be tested against the
workflow it describes.
