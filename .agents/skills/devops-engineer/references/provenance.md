# Provenance and limits

## Human direction

On 2026-10-25 Chris asked for a reusable DevOps persona/skill, comparable to the CTO and research
engineer skills, responsible primarily for CI and CD delivering on time. He accepted avoiding a
forever chat, favored responsibility and event/deadline-driven wakeups, and suggested deeper
reasoning for incidents. He asked for multiple subject tags on roadmap tickets and corresponding
worklogs, including `engineering` and `devops`, across future infrastructure/CI/CD work.

His follow-up makes Morpheus's own ticket/worklog structure primary even while another session
explores Paperclip. Mapping additional queue tasks is a later adapter concern. This source change
adds no runtime supervisor and grants no new model, provider, spending or credential capability.

## Recorded lessons

Morpheus's `.agent/decisions.md` records deterministic heartbeat assessment, GitHub Manager as PR
backstop, host-local resumable repair sessions, CD V2's one reconciler and exact internal delivery
acceptance, external follow-up independent of internal acceptance, and separate source/consumer/
runtime gates. `.agent/learned.md` records unknown-versus-empty failures, stale claims masking a full
queue, reporting delivery separate from execution, provider timestamp sentinel differences and
upload transport separate from asynchronous processing.

The Evo/Morpheus CD campaign additionally exposed passing test commands followed by failed bounded
artifact admission, controller host identity differences, quota-read timeout distinct from quota
exhaustion, repeated agent resumptions against unchanged funding blockers, and optional acceptance
work delaying ordinary live value. Cheap capability checks before waking inference are a proposed
supervision improvement, not a claim that V2 backoff changed. These are observed failure
classes, not grounds for hard-coding Evo's hosts, identities, test counts, budgets or waived waits
into a reusable role. `MO-26-10-25-03.01.09` retains this skill's implementation and validation record.

## Design choices

A durable current incident brief, cheap deterministic sensing, bounded incident reasoning and an
independent host liveness observer are the proposed supervision shape. Reuse existing controller
ownership and queue mechanisms before adding infrastructure. Selection of a new runtime, scheduler,
model or paid service remains a separate implementation/release decision under the actual mandate.
Subject tags are open vocabulary, optional for legacy records and independent of authorization.
