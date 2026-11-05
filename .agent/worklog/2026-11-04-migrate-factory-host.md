---
date: 2026-11-04
roadmap: MO-26-11-04-21.51.56
tags: [engineering, devops, factory]
---

# Migrate morpheus-factory host tooling into the Factory plugin

Chris authorized moving the reusable contents of the public `cpheinrich/morpheus-factory`
repository into the optional Factory plugin, sanitizing what is imported, and keeping personal
fleet configuration private and local until Firestore becomes the authority.

**What was built.** `plugins/factory/src/host/` is a self-contained package (own
`package.json`, lockfile, workspace file and vitest config) holding the TypeScript core
(`core/`, renamed from `src/` only), and the Python/shell worker, fleet, cleanup and sub2api
tooling, imported from `a67e1b0c139c83118a2364bfa43f1cfb5403eef0` without history.
`worker/host_config.py` is the one private-manifest boundary: `$FACTORY_HOME/hosts.json`,
absolute, a regular file, owned by the login user, no group/other bits, schema version 1,
plain host names, and no credential-shaped value. Its `import` command copies an existing
manifest with exclusive creation and mode 600. The update controller, fleet coordinator,
LaunchAgent installer and hourly runner all read through it.

Behaviour changes, each deliberate:

- Personal and project defaults are gone: `--github-user`, the consumer repository, the
  consumer/host-setup checkout fallbacks in both controllers, project simulator name patterns
  and QA preview namespaces in the storage watchdog (now operator-declared in
  `~/.config/morpheus-factory/simulators.json`), and the reserved runner name (now
  `FACTORY_RESERVED_RUNNERS`). The consumer validation script is `validate_consumer_main.py`
  with a configurable in-checkout `--script` (default: the Morpheus iOS layout).
- The manifest must live outside every Git checkout, judged on the given path and on its
  directory with links resolved, and readers pass the path unresolved so the link refusal
  holds. `import` refuses a destination inside a checkout and never overwrites.
- The hourly runner no longer fetches and fast-forwards its own checkout; an installed copy is
  not a checkout, and `check` no longer requires `paths.factory` to be one.
- `install_updates.py` keeps the replaced plist as `.previous`, restores it with `--rollback`,
  and refuses with exit 75 while launchd reports the tick's PID.
- `install-cleanup.sh` leaves an unchanged, loaded storage watchdog alone on setup reruns.
- `setup.sh` accepts the installed package instead of requiring a Git clone.
- The plugin installer's copy filter (`installCopyFilter`) also skips `dist`, `hosts.json`,
  `factory.json` and `.env*`.

**Sanitization.** The source manifest was not imported; `examples/hosts.example.json` is
synthetic. Hostnames, home paths, runner labels, Apple team and certificate ids, certificate
subject names and organizations, device UDIDs, a tailnet name, email addresses, gateway quota,
run provenance and copied consumer excerpts were replaced with synthetic values or removed.
The first pass missed certificate subjects, organizations and ids, two personal fallbacks and
the preview namespace; a root review sweep found them before publication, and the shape guard
now covers certificate subjects, organizations and ids through a synthetic allowlist. Run
against the original source files, it flags their personal data without the test listing any
real value. Names that have no recognizable shape (hostnames, repository names) were removed
by a manual case-insensitive sweep, which the guard cannot replace. The source repository and
its history still hold the original data; that cleanup is separate and not claimed here.

**Local action on this Mac.** `host_config.py import` preserved the source checkout's manifest
(identical to the source commit) at `~/.local/share/factory/hosts.json`, mode 600, owner-only,
outside any checkout; content verified equal; nothing overwritten. No service, LaunchAgent,
credential, native login, gateway or other repository changed. Live hosts still run from their
source checkouts; `src/host/README.md` gives the per-host migration with rollback.

## Verification (commands run on the final tree)

- `plugins/factory/src/host`: `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm typecheck`,
  `pnpm build` all exit 0; `pnpm test` → vitest 68/68, unittest 271/271 (235 imported, adapted;
  36 new); `shellcheck` on every shell script exit 0.
- `plugins/factory`: `pnpm check` exit 0; `pnpm test` 197/197.
- Root: `pnpm typecheck`, `pnpm lint`, `pnpm compile` (no `dist/` change), `pnpm morpheus pm
  index`, `pnpm morpheus pm validate`; `pnpm exec vitest run tests/ci-scope.test.ts
  tests/factory-distribution.test.ts` 43/43. No full root suite: shared core is unchanged.
- An intermittent plugin failure: `tests/unattended-worker.test.mjs` "output bound returns a
  resumable checkpoint and bounded durable logs" failed in 2 of 5 full-suite runs (`sessionId`
  null, expected `session-cap`) and passed 5/5 alone. The worker sources and that test are
  identical to `origin/main`; this change touches only the installer copy filter, README and
  installer tests in the plugin. Likely a load-timing race in the output cap, not caused here;
  not fixed in this change.

## Dead ends

- Running vitest in the nested package first climbed to the Morpheus root config; the package
  now has its own `vitest.config.ts`.
- `pnpm install --ignore-workspace` there skipped the package's own `allowBuilds`; plain
  `pnpm install` is correct because the package's workspace file makes it its own root.

## Open questions

- Pinning the sub2api image by digest, and floating postgres/redis patch tags, remain as noted
  in the source review; not changed here.
