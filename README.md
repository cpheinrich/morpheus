# Morpheus

An operating system for building and running companies, designed to be operated by agents.

Morpheus does two things:

1. **Initializes** a new company repository with the full structure, tooling, and third-party wiring already in place.
2. **Maintains** the reusable packages that repository depends on, so an improvement made once propagates everywhere.

Named for the Greek god who gives shape to formless things — from *morphē*, "form."

## Status

Pre-implementation. The design is being worked out in [`architecture.md`](./architecture.md); no code has been written yet.

## Usage

Not yet implemented. The intended entry point:

```sh
morpheus init acme          # interactive wizard → new repo, fully scaffolded
morpheus upgrade            # pull newer templates + packages into an existing project
morpheus doctor             # verify a project matches current conventions
```

## Documentation

**[`architecture.md`](./architecture.md)** — the complete specification: principles, project
structure, canonical tool choices, package catalog, agent operating model, and secrets
convention. Read that first; this file is only an index.

## Scope

Private. Used by Chris Heinrich and a small number of family and friends for their own
projects. Conventions here are deliberately opinionated and non-negotiable by default —
the point is to trade configurability for consistency.
