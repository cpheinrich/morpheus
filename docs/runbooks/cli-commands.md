# Morpheus command reference

**Read this when** you need a command not listed in `AGENTS.md`. `morpheus <command> --help` is authoritative for flags.

```sh
pnpm install
pnpm compile && node dist/cli/index.js self install  # clean current main — copied, never linked
pnpm typecheck             # tsc --noEmit
pnpm test                  # vitest run
pnpm test:rules            # generated firestore.rules vs the emulator — needs Java
pnpm compile               # tsc -p tsconfig.build.json; refreshes committed dist/
pnpm morpheus pm validate   # validate hq/product frontmatter
pnpm morpheus pm index      # retire legacy roadmap tables; refresh goal/request indexes
pnpm morpheus pm new roadmap "Title here" --priority P1 [--issue 123]
pnpm morpheus pm link-issue MO-014 123  # attach an issue to existing work
pnpm morpheus pm migrate-ids --check   # integer roadmap ids → the dated scheme (MO-057)
pnpm morpheus pm block MO-051 --needs "what would unblock this"
pnpm morpheus pm unblock MO-051
pnpm morpheus heartbeat            # what should happen next, and whether anything should
pnpm morpheus gh-manager sweep <owner/repo>  # how the GitHub Manager would route each open PR
pnpm morpheus review prompt        # the rung-2 reviewer prompt for this branch
pnpm morpheus voice knowledge      # standing explainer, uploaded once as project knowledge
pnpm morpheus voice brief "topic"  # today's state, to paste into a voice session
pnpm morpheus team validate        # the roster, and every meeting note
pnpm morpheus registry list        # every Morpheus project on this machine
pnpm morpheus profile report --since 2026-09-01  # where agent time and tokens went, from local transcripts
pnpm morpheus profile extract --out rows.jsonl   # the session and tool-call rows behind the report
pnpm morpheus brand status         # what the brand package still needs
pnpm morpheus brand init           # scaffold brand-vibes.md, local moodboard, and concept-media folders
pnpm morpheus brand explore        # refresh the five-direction brand review handoff
pnpm morpheus brand finalize --selection "Name" # promote a reviewed direction into canonical records
pnpm morpheus init                 # scaffold a project — safe to re-run, never overwrites
pnpm morpheus init status          # how far through project setup this repo is
pnpm morpheus web init             # provision and scaffold the website: waitlist + /hq sign-in
pnpm morpheus web add-consumer-auth # consumer accounts: staging project, auth plumbing, three suites
pnpm morpheus web status           # what the web surface has, and what it is missing
pnpm morpheus firebase auth setup --project <id> --domain <public-origin>
pnpm morpheus firebase auth check --project <id> --domain <public-origin>
pnpm morpheus access sync          # apply morpheus.json's allowlist to Firebase custom claims
pnpm morpheus hq rules --rules-path infra/firebase/firestore.rules
pnpm morpheus hq rules --check --rules-path infra/firebase/firestore.rules
pnpm morpheus context refresh      # take a context receipt — after reading the records
pnpm morpheus context status       # what the current lease says, and how old it is
pnpm morpheus context install      # wire the session-start hooks — run it once per project
pnpm morpheus codebase-memory install         # trusted-device bootstrap, safe to re-run
pnpm morpheus codebase-memory install --check # verify operational mode without changing it
```
