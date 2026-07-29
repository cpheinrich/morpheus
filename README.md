# Morpheus

An operating system for building and running companies, designed to be operated by agents.

Morpheus does two things:

1. **Initializes** a new company repository with the full structure, tooling, and third-party wiring already in place.
2. **Maintains** the reusable packages that repository depends on, so an improvement made once propagates everywhere.

Named for the Greek god who gives shape to formless things — from *morphē*, "form."

## Status

Early. The project management layer is built and in use; the initializer is not written yet —
deliberately, since the first hand-retrofit of a real project is meant to be its specification.

Current work is tracked in [`hq/product/roadmap/`](./hq/product/roadmap/), which Morpheus
generates with its own tooling.

## What works today

```sh
pnpm install

morpheus pm validate                      # validate hq/product frontmatter against the schemas
morpheus pm index                         # regenerate the README index tables
morpheus pm new roadmap "Ship analytics" --priority P1
```

Not yet implemented:

```sh
morpheus init acme     # interactive wizard → new repo, fully scaffolded
morpheus add android   # bolt a new surface onto an existing project
morpheus upgrade       # pull newer templates and kit into an existing project
morpheus doctor        # verify a project matches current conventions
```

## Documentation

**[`architecture.md`](./architecture.md)** — the complete specification: principles, project
structure, canonical tool choices, the agent operating model, credential bootstrap, and
secrets convention. Read that first; this file is only an index.

[`AGENTS.md`](./AGENTS.md) is the entry point for agents working in this repo.

## Scope and expectations

Built for my own projects and shared with a few family and friends. The source is public
because that is simpler than keeping it private, not because it is a product.

There is no support, no roadmap commitment, and no stability guarantee. Conventions are
deliberately opinionated and mostly non-negotiable — the whole point is trading configurability
for consistency, which makes it a poor fit for anyone whose stack differs from mine.

## License

**[PolyForm Noncommercial 1.0.0](./LICENSE.md)** — source-available, not open source.

Free for any noncommercial purpose: personal projects, hobby work, research, and study.

**Commercial use requires a separate license.** That includes using Morpheus to build or
operate anything intended for commercial advantage or monetary compensation. If you want to
use it commercially, open an issue.

Contributions are not being accepted at this time, so that relicensing stays possible.
