---
id: MO-26-07-29-032
title: "Convention checks must not require the consumer to be a pnpm project"
status: shipped
priority: P0
goal: MO-G-2026-Q3-01
owner: agent
prs: [24]
created: 2026-07-29
updated: 2026-07-29
---

> Migrated from `MO-032` to `MO-26-07-29-032` (MO-057). References to `MO-032` in git
> history, commit messages and merged pull requests still resolve — the old number is
> the last field of the new id.

## Context

_Why this matters._

## Approach

_How it will be done._

## Context

Found while retrofitting. Two of the three remaining projects — `cpheinrich.com` and
`heinrichbros.com` — have no root `package.json` at all, and `lakina` is npm plus Python.

`pr-check.yml` ran `pnpm install --frozen-lockfile` **in the consuming repo**, so it silently
required every project to be a pnpm Node project. PR conventions have nothing to do with what
language a project is written in.

## Shipped

`pr-check` now builds the Morpheus CLI from a checkout, the same way `pm-check` already did. Both
convention checks are toolchain-agnostic.

`init` scaffolds the Node CI job **only when there is a pnpm lockfile**, and says why when it does
not. A scaffold whose CI is red on the first push teaches people to ignore red CI, which costs more
than the workflow was worth.

## The general shape

A reusable workflow that installs in the consumer's repo inherits the consumer's toolchain as a
requirement, whether or not it needs one. `pm-check` got this right by accident of being written
first; `pr-check` copied the structure of `node-ci` instead.
