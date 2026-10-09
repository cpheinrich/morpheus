---
date: 2026-10-09
agent: codex
roadmap: MO-26-10-09-16.02.57
outcome: complete
summary: Durable agent-neutral QA comment queue and serialized background responder.
---

# QA comment queue

Chris sent multiple batches during Evo iOS comment QA and asked for them to
accumulate without occupying the interactive chat. The existing pending
directories preserved them, but there was no exclusive consumer claim and a
fresh Codex checkout had no wake route. The configured webhook in Evo's primary
checkout targets another routine and was not copied.

The shared writer now publishes the complete batch atomically. Agents reserve
oldest unclaimed batches with an identity, resolve them as that identity, or
release them after failure. Claims persist across process exits; force release
is an explicit recovery action after confirming the responder stopped. New
batches remain queued while earlier ones are claimed. Both overlays report the
open count and whether a wake route is configured. The guide and skills use the
same agent-neutral contract for Claude, Codex, Grok, and other hosts.

The background responder reads a local agent command and invokes it in a
separate process. One responder owns the checkout and handles claimed batches
serially, so a later Send appends while the interactive chat stays free. Codex
can use its noninteractive `codex exec` CLI; other agents can supply their own
command. A failed child leaves its claim and stops for recovery. The ownership
marker tells other chats not to edit the same checkout until the responder
stops. The child remains on the QA session branch and commits locally; the
interactive chat completes review and PR work after the session.
The child prompt names this worker's compiled Morpheus CLI, so a previously
installed global CLI cannot bypass the new claim contract during a pre-merge
QA session. The worker normalizes a relative checkout root, publishes its
ownership marker atomically, and waits for an interrupted child process group
to exit before releasing ownership.
After a crash, recovery refuses to release ownership until an operator confirms
that the child agent and descendants have stopped. A short exclusive recovery
guard prevents another responder from acquiring the checkout while the stale
owner is removed.

Focused verification covers concurrent claims, resolver races, later batches,
wrong-agent resolution, claim recovery, serial background handling, failed
children, and queue status in both overlays. Final check results and review
evidence follow below.

Local checks: focused QA tests 104/104 passed on the final responder changes;
full `pnpm test` 2083/2083 passed on the preceding implementation commit;
`pnpm typecheck`, `pnpm lint`, and `pnpm compile` passed after the final
changes. `pnpm morpheus pm index --dir hq/product` made no changes. CI runs the
full suite on the final commit.

## Independent review

The independent high-risk reviewer found a claim/resolve race and seven substantive responder ownership and recovery defects. The author fixed them; the same reviewer cleared the corrected queue and responder at 218852e. One minor stale-status finding was fixed in 2474728 under the reviewer's exact path and verification condition. The focused 104-test QA suite, typecheck, lint, and compile passed after that correction.

```morpheus-review
{
  "version": 2,
  "base": "eab2282f46a720c96a7413322000fe2c1096bfbd",
  "reviewed": "10ec1e2055ee3a93e20e38ed584b9f200164573a",
  "covered": "2474728fc01cd5288b4d5faf74c042305f7650e8",
  "authorSession": "01a122e7-5ab7-7be3-a2d7-ad6906693e38",
  "reviewerSession": "/root/morpheus_qa_queue/qa_queue_review",
  "risk": "high",
  "elapsedMinutes": 1.3,
  "timing": {
    "source": "clock",
    "durationMs": 78000,
    "evidence": "Author clock immediately before initial reviewer invocation: 2026-10-09 23:11:46 UTC; reviewer completion clock: 23:13:04 UTC."
  },
  "outcome": "complete",
  "summary": "The independent high-risk reviewer found a claim/resolve race and seven substantive responder ownership and recovery defects. The author fixed them; the same reviewer cleared the corrected queue and responder at 218852e. One minor stale-status finding was fixed in 2474728 under the reviewer's exact path and verification condition. The focused 104-test QA suite, typecheck, lint, and compile passed after that correction.",
  "findings": [
    {
      "id": "QA-1",
      "severity": "substantive",
      "description": "An unclaimed resolver could move a batch while another agent claimed it, letting both report success and leaving a stale claim.",
      "paths": ["src/qa/store.ts", "tests/qa-comments.test.ts"],
      "disposition": "fixed",
      "response": "The resolver now acquires the same exclusive claim boundary before moving the batch; 60 focused race trials and the reviewer's 1000-trial harness found no conflicting outcome."
    },
    {
      "id": "QA-2",
      "severity": "substantive",
      "description": "Abort released checkout ownership before an uncooperative child process exited.",
      "paths": ["src/qa/responder.ts", "tests/qa-comments.test.ts"],
      "disposition": "fixed",
      "response": "The worker now signals the child process group, escalates to SIGKILL after a grace period, and keeps ownership until close."
    },
    {
      "id": "QA-3",
      "severity": "substantive",
      "description": "A crash between creating the owner directory and writing its marker left an unrecoverable markerless lock.",
      "paths": ["src/qa/responder.ts"],
      "disposition": "fixed",
      "response": "The complete owner record is staged first and published with an exclusive hard link."
    },
    {
      "id": "QA-4",
      "severity": "substantive",
      "description": "A relative checkout root was expanded relative to the child cwd again, pointing the agent at the wrong path.",
      "paths": ["src/qa/responder.ts", "tests/qa-comments.test.ts"],
      "disposition": "fixed",
      "response": "The worker resolves the checkout root to an absolute path before ownership, command expansion, and prompting; the test starts it with a relative root."
    },
    {
      "id": "QA-5",
      "severity": "substantive",
      "description": "The child could invoke an older global CLI, and a source-mode invocation could tell it to run TypeScript with plain Node.",
      "paths": ["src/qa/responder.ts", "tests/qa-comments.test.ts"],
      "disposition": "fixed",
      "response": "The prompt names this worker's compiled Morpheus CLI from both source and distribution entrypoints; the test inspects that prompt."
    },
    {
      "id": "QA-6",
      "severity": "substantive",
      "description": "A normally exiting agent could leave a descendant editing the checkout while the next batch started.",
      "paths": ["src/qa/responder.ts", "tests/qa-comments.test.ts"],
      "disposition": "fixed",
      "response": "The worker terminates remaining members of the agent process group on every close, and a delayed descendant regression stays silent."
    },
    {
      "id": "QA-7",
      "severity": "substantive",
      "description": "After a worker crash, recover could remove checkout ownership while an orphaned agent child still edited.",
      "paths": ["src/qa/responder.ts", "src/cli/qa.ts", "docs/runbooks/qa-comments.md"],
      "disposition": "fixed",
      "response": "Recovery fails closed until an operator verifies the child and descendants have stopped and explicitly passes --confirm-no-agent-process."
    },
    {
      "id": "QA-8",
      "severity": "substantive",
      "description": "Concurrent recover calls could unlink a replacement live owner's marker.",
      "paths": ["src/qa/responder.ts", "tests/qa-comments.test.ts"],
      "disposition": "fixed",
      "response": "An exclusive recovery guard serializes recover calls; responder acquisition checks the guard before and after publishing ownership."
    },
    {
      "id": "QA-9",
      "severity": "minor",
      "description": "Status and stop reported a dead worker marker as live work.",
      "paths": ["src/qa/responder.ts", "src/cli/qa.ts"],
      "disposition": "fixed",
      "response": "Status now identifies a stale marker and stop refuses with guarded recovery guidance in commit 2474728.",
      "condition": {
        "paths": ["src/qa/responder.ts", "src/cli/qa.ts", "tests/qa-comments.test.ts", "dist/qa/responder.js", "dist/qa/responder.d.ts", "dist/qa/responder.js.map", "dist/cli/qa.js", "dist/cli/qa.d.ts", "dist/cli/qa.js.map"],
        "evidence": "Assert stale status and stop behavior; run focused qa-comments tests, typecheck, lint, and compile."
      },
      "conditionMet": "Commit 2474728 changed only the conditioned source, test, and generated distribution paths. The stale status and stop assertions passed with the focused QA suite (104/104); typecheck, lint, and compile passed."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "/root/morpheus_qa_queue/qa_queue_review",
      "commit": "218852ec57d49da2078deb1afd1b80effee5c9ed",
      "outcome": "cleared",
      "elapsedMinutes": 7.833333333333333,
      "timing": {
        "source": "clock",
        "durationMs": 470000,
        "evidence": "Author clock immediately before follow-up invocation: 2026-10-09 23:22:08 UTC; reviewer final completion clock: 23:29:58 UTC."
      },
      "summary": "QA-1 through QA-8 resolved; QA-9 cleared conditionally for a minor stale-status correction with exact paths and checks."
    }
  ]
}
```
