---
roadmap: MO-26-10-29-14.02.58
tags: [engineering, devops, infrastructure]
---

# Add an opt-in host-bound Claude subscription repair executor

**Ask.** Chris asked for CD V2 repair work to run on his own Claude Max sign-in on the MacBook Pro
(cpheinrich@gmail.com), not Zoe's accounts, without API keys, token export, new OAuth scopes or paid
usage. The local executor was hard-wired to Codex, and Claude existed only as the hosted executor,
whose quota readback needs an exported token with `user:profile`.

**What was built.** `agents.claude` with `cd worker --executor claude` and `cd quota --executor
claude`, designed first in `docs/cd-v2-claude-executor.md` and revised after an independent design
critique (two blocking and seven should-fix items, all answered in its Appendix C). The executor
reads plan usage through the Claude Code CLI's own `get_usage` control request, so Morpheus never
handles a token; trusts that reading only from analysed CLI builds (2.1.312 today); binds the exact
account through each process's `initialize` reply before any prompt is written; excludes MCP
servers and every settings file; refuses unless paid extra usage is disabled and the configured
model family has a listed weekly window; and stops a run the moment the provider signals paid usage.
Codex and hosted paths, keys and digests are unchanged.

**Result.** Works end to end on synthetic fixtures and, live on the Pro, for the read and run
protocols: the reader returns fresh windows in about 0.7 s with no model turn (Fable admissible,
Opus correctly waiting for lack of a listed family window; wrong email or plan refused), and one
minimal Haiku turn through the exact run protocol produced the expected `initialize`, `system/init`
(`apiKeySource: "none"`, no MCP servers), rejected-overage rate event and structured result. No
ledger, host or LaunchAgent was touched.

**Open for the consumer.** Adoption is a separate Evo migration and ops review. The run has
`bypassPermissions` without a filesystem sandbox (a named difference from Codex that the design
lists in full for authorization), and every Claude Code update needs a reviewed Morpheus change
adding the build before the worker will run on it.

## Appendix A: validation

- `pnpm exec vitest run tests/cd/claude-executor.test.ts tests/cd/claude-quota.test.ts`: 76/76.
- `pnpm exec vitest run tests/cd tests/cli-dispatch.test.ts`: 1223/1224 on the first run; the one
  failure is the pre-existing cleanup-fuse timing flake in `tests/cd/quota-reader-cli.test.ts`
  (2998 ms against `>= 3000`), which also failed 1 of 3 runs on trunk and passed 3/3 on rerun here;
  filed as #560. Scope: `tests/cd` is every direct dependent of the changed schema and worker.
- Existing worker/quota suites before docs (`native-worker`, `worker`, `quota-reader*`,
  `repair-control`, `blocker-proof`, `state`): 357/357.
- `pnpm typecheck`, `pnpm compile`, eslint on changed files, `pnpm morpheus pm index`: pass.
- Mutation check: nine guards each removed in turn (ledger-digest opt-in, structured-result
  attestation gate, overage-status stop, Claude wait leaving `nextCheckAt`, admission-wait due,
  extra-usage rule, freshness discriminator, API-key-source binding, quota-file refusal); every
  mutant failed at least one test, and the source was restored.
- Config digests without `agents.claude` are asserted against fixed values computed from trunk's
  committed runtime (`b71edea0…`, `da99e122…`).

## Appendix B: live probes on the Pro (control requests except one Haiku turn)

- `get_usage` through the reader: session 5-7 %, weekly 16-17 %, Fable weekly 0 %, extra usage
  disabled (`user_disabled: true`).
- Without `--strict-mcp-config` a `claude -p` session on this account loads the claude.ai Gmail,
  Calendar, Drive, Vercel, Asana and other connectors plus user hooks; with it and
  `--setting-sources ""` it loads none.
- `initialize` reply: `claude_code_version`, `account { email, organization, subscriptionType
  "Claude Max", apiProvider "firstParty" }`. `list_permission_rules` shows the four disallowed
  tools as `cliArg` deny rules under `bypassPermissions`.
- Run protocol: one Haiku turn, 2.5 s, notional cost $0.0009 on the subscription.

## Appendix C: dead ends

- A raw `claude -p` with `--tools ""` and stdin closed immediately returns before replying to a
  control request; the reader keeps stdin open until the reply.
- `vitest --root /` to run an ad-hoc smoke file crawled the filesystem; `tsx` with an `.mts` file
  was used instead.
