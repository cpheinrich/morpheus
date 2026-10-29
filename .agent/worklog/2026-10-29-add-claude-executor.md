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

## Appendix D: initial review response (before the follow-up turn)

The fresh reviewer returned the initial turn blocked. F1 (substantive): the held-aware worker entry,
which consumers must use when repair holds exist, has its own `due` predicate, so the Claude
starvation fix never applied there. F2 (minor): the Claude due rule trusted `intent.nextAction`,
which in-run stops also write and which can be stale, giving an attestation re-run loop, retries
after an error without backoff, possible preemption of an in-flight hosted dispatch, and Claude
waits overwriting a live owner's status.

Both are fixed in one commit and go to the same reviewer's follow-up turn rather than the offered
conditional clearance, because F2 changes `worker.ts`. A new pure module `src/cd/admission-wait.ts`
(no worker import) holds one predicate used by the worker selector and the held-aware entry: work is
due for Claude only when a subscription admission wait is its latest event (an `admission-wait-…`
transition exists for it, nothing started or ended after the latest one, and no run or dispatch is
open). A Claude admission wait under another owner's live lease records its transition but leaves
the intent's status. Docs: the design bullet, the repair-control runbook's Selection bullet and the
controller summary. Tests: 98 across the Claude and repair-control files; five new mutants (live
invocation, latest-event comparison, record required, held-aware due, live-lease retention) each
fail tests, sources byte-restored. `tests/cd` plus CLI dispatch: 1231/1231.

## Independent review

Fresh independent review at high risk. The initial turn (eb969631) was blocked: F1 (substantive) showed the held-aware worker entry, which consumers must use when repair holds exist, kept its own due predicate, so a Claude worker would still idle behind a failing Codex worker; F2 (minor) showed the Claude due rule trusted intent.nextAction, which in-run stops also write, allowing an attestation re-run loop, retries after an error without backoff, preemption of an open hosted dispatch, and Claude waits overwriting a live owner's status. The author moved the rule into a pure shared predicate (src/cd/admission-wait.ts) requiring a recorded admission wait to be the work's latest event with no open run or dispatch, applied it in both the worker selector and the held-aware entry for --executor claude only, kept a live owner's status on a Claude wait, corrected the docs and added tests and mutants. The same reviewer's follow-up turn cleared e3ef525b: F1 and F2 resolved, no new findings, Codex and hosted selection and admission-wait records byte-identical, committed dist matching a fresh build. Limitation: no model turn was run by the reviewer; the author's single live Haiku protocol probe is the only real run.

```morpheus-review
{
  "version": 2,
  "base": "dca763c352a64c4d9a6a48c9c569585638cfb863",
  "reviewed": "eb969631da6cdec6ed8630bcc36222adbebe2ce1",
  "covered": "e3ef525bd0f2a3e011f0b4158fcd50f5d67877c5",
  "authorSession": "claude-code/cae29785-49d9-41ff-9b32-6350ae76eb63",
  "reviewerSession": "claude-code-subagent/a0485d70170e8eaf9",
  "risk": "high",
  "elapsedMinutes": 11.39075,
  "timing": {
    "source": "runner",
    "durationMs": 683445,
    "evidence": "Claude Code Agent tool result for reviewer subagent a0485d70170e8eaf9, initial turn: duration_ms=683445."
  },
  "outcome": "complete",
  "summary": "Fresh independent review at high risk. The initial turn (eb969631) was blocked: F1 (substantive) showed the held-aware worker entry, which consumers must use when repair holds exist, kept its own due predicate, so a Claude worker would still idle behind a failing Codex worker; F2 (minor) showed the Claude due rule trusted intent.nextAction, which in-run stops also write, allowing an attestation re-run loop, retries after an error without backoff, preemption of an open hosted dispatch, and Claude waits overwriting a live owner's status. The author moved the rule into a pure shared predicate (src/cd/admission-wait.ts) requiring a recorded admission wait to be the work's latest event with no open run or dispatch, applied it in both the worker selector and the held-aware entry for --executor claude only, kept a live owner's status on a Claude wait, corrected the docs and added tests and mutants. The same reviewer's follow-up turn cleared e3ef525b: F1 and F2 resolved, no new findings, Codex and hosted selection and admission-wait records byte-identical, committed dist matching a fresh build. Limitation: no model turn was run by the reviewer; the author's single live Haiku protocol probe is the only real run.",
  "findings": [
    {
      "id": "F1-held-aware-starvation",
      "severity": "substantive",
      "description": "runHeldAwareWorker kept its own nextCheckAt-only due predicate and always passes an explicit workId, so the Claude starvation fix in selectDefaultRepair never applied on the held-aware entry consumers must use with repair holds; a Claude worker idled behind a failing Codex worker's admission waits.",
      "paths": [
        "src/cd/worker-only-entry.ts",
        "src/cd/worker.ts",
        "docs/cd-v2-claude-executor.md",
        "docs/runbooks/cd-repair-control.md"
      ],
      "disposition": "fixed",
      "response": "Added src/cd/admission-wait.ts, a pure predicate importing only schema types, and applied it in runHeldAwareWorker for executor claude only (not complete, lease free, latest-event admission wait). due() and Codex/hosted selection unchanged; held work still repair-held. Tests cover Claude launching and local idling behind a real Codex admission-wait record, and repair-held. Fixed in e3ef525b; cleared by the same reviewer's follow-up."
    },
    {
      "id": "F2-stale-next-action",
      "severity": "minor",
      "description": "The Claude due rule read intent.nextAction, which in-run stops (attestation, overage, meter), error checkpoints and older waits also leave set, so Claude could re-run without backoff, preempt an open hosted dispatch, or overwrite a live owner's status with its own wait.",
      "paths": [
        "src/cd/worker.ts",
        "docs/cd-v2-claude-executor.md"
      ],
      "disposition": "fixed",
      "response": "Due only when an admission-wait transition exists for the work, is newer than the latest invocation's start and end, and no run or dispatch is open; in-run stops write no such transition and keep their poll schedule. A Claude admission wait under another owner's live lease records its transition with statusRetained and leaves the intent's blocker and next action. Doc sentence corrected. Fixed in e3ef525b with tests and mutants; cleared by the follow-up."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "claude-code-subagent/a0485d70170e8eaf9",
      "commit": "e3ef525bd0f2a3e011f0b4158fcd50f5d67877c5",
      "outcome": "cleared",
      "elapsedMinutes": 2.751,
      "timing": {
        "source": "runner",
        "durationMs": 165060,
        "evidence": "Claude Code Agent tool result for reviewer subagent a0485d70170e8eaf9, follow-up turn: duration_ms=165060."
      },
      "summary": "Same reviewer cleared e3ef525b: F1 and F2 resolved with probes of the committed dist and edge cases (in-run stop, older wait, open dispatch, live lease, prefix work ids), no regressions in Codex or hosted selection, 125 focused tests pass."
    }
  ]
}
```
