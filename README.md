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

## Install

```sh
git clone https://github.com/cpheinrich/morpheus.git ~/code/morpheus
cd ~/code/morpheus && pnpm install && pnpm compile && npm link
```

`npm link` puts `morpheus` on your PATH, so it works from any project directory. There is no
published package — see the licence below.

Register each project once so ids and prefixes stay unique:

```sh
cd ~/your-project && morpheus registry add
```

## What works today

```sh

morpheus pm validate                      # validate hq/product frontmatter against the schemas
morpheus pm index                         # retire legacy roadmap tables; refresh other indexes
morpheus pm new roadmap "Ship analytics" --priority P1
morpheus web status                       # what the web surface has, and what it is missing
morpheus web init                         # provision the cloud resources, then scaffold the site
morpheus firebase auth setup --project <firebase-project> --domain <public-origin>
morpheus firebase auth check --project <firebase-project> --domain <public-origin>
```

`morpheus web init` is the website initializer. It provisions the GCP project, Firebase,
Firestore, the registered web app and the Workload Identity that a Vercel deployment
authenticates as, then scaffolds the code that depends on them: a Next.js app if there is none,
**email waitlist capture on the home page**, and **`/hq` behind Google sign-in**, gated on the
same `role` custom claim that Firestore rules read.

It never overwrites. Every existing file is skipped and reported, so the same command creates a
site from nothing and adds the missing half to one that has been live for months — it will not
touch a working home page. The Firebase-dependent half is written **only once a Firebase project
is real**: a sign-in page holding a placeholder config looks finished and cannot work.

This is deliberately not part of `morpheus init`, which scaffolds the repository and provisions
nothing so it can never be blocked on a token.

After a successful setup, Morpheus records the normalized origin and user-visible OAuth support
identity in `morpheus.json` as `publicDomain` and `supportEmail`. Later runs reuse both values and
report authorized domains that are no longer expected so an operator can decide whether to revoke
them. Add legitimate preview or secondary Auth hosts to `authorizedDomains` (hostnames only) so
they remain part of the expected set. The check refuses to report Google sign-in ready when the
public origin is unknown.

Not yet implemented:

```sh
morpheus init acme     # interactive wizard → new repo, fully scaffolded
morpheus add android   # bolt a new surface onto an existing project
morpheus upgrade       # pull newer templates and kit into an existing project
morpheus doctor        # verify a project matches current conventions
```

## What to expect

Initializing a project with Morpheus costs more up front than starting from a blank repo. You
answer a wizard, credentials get provisioned, and structure exists before there is anything to
put in it.

The return is compounding, and it arrives in three waves:

1. **Immediately** — agents are not blocked. Credentials are in place, the repo layout is
   predictable, and CI works on the first push. Most of the friction in a young project is an
   agent waiting on an auth step a human has to perform.
2. **Within weeks** — the structure itself does work. Having to state the audience, the
   boundaries, and the goals before writing code produces a cleaner result for the same reason
   an outline does, or a test written first. Schematizing the business is not overhead; it is
   the thinking, done where it can be reused.
3. **Over months** — memory accumulates. Decisions, worklogs, and customer data mean an agent
   starting today knows what was tried in March and why it was abandoned.

Worth it for a single project on point 2 alone. Across several, the reuse makes the first two
waves nearly free.

## Editing

Everything Morpheus manages is plain markdown with YAML frontmatter, so **any editor works** —
the tooling is deliberately editor-agnostic and nothing here depends on a particular one.

If you want a WYSIWYG surface, [Nimbalyst](https://github.com/nimbalyst/nimbalyst) is a good
fit: it renders frontmatter as typed form fields, so roadmap items and inboxes get form editing
for free, and it manages parallel Claude and Codex sessions. That is a suggestion, not a
requirement — validation happens in CI, not in the editor, which is what keeps it optional.

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
