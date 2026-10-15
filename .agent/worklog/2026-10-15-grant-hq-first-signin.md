# Grant HQ access on first Google sign-in

Issue #386 came from Darwin: a listed account was denied because the Firebase user existed for the first time only after Google sign-in, while `morpheus access sync` had previously written claims only to existing users. Darwin's project-local repair and its 17 focused tests were the reference for this kit change.

The generated HQ route now resolves a role from the deployed repository manifest, validates the verified Google provider, writes or repairs the user's custom `role` claim, and returns 409 so the generated client force-refreshes its ID token before session-cookie creation. A user removed from the manifest has a stale stored role cleared and refresh tokens revoked on their next sign-in. Prompt bulk revocation for absent users remains the explicit `morpheus access sync` responsibility; existing cookies have the separately tracked revocation boundary documented in Darwin. The scaffold generates a server-only allowlist lookup with the correct relative manifest path for both monorepo and root-level Next apps.

Focused checks: `pnpm exec vitest run tests/web-provision.test.ts tests/web-scaffold.test.ts tests/web-hq-signin.test.ts` — 49 passed. These cover the scaffold, first sign-in, unlisted and stale claims, admin precedence, Google verification, token refresh and direct web provisioning. `pnpm typecheck` passed. No local full suite because the changed code is in `src/web/`, outside the shared-core paths requiring it; CI runs the full suite. This PR changes generated code, not Darwin's deployed app, so production sign-in is not claimed as verified here. The claim also reconciled previously merged #398's roadmap status to shipped; it does not modify that issue's implementation.

Initial independent review of `547cad838a4053d877b0f49eb51eb0087fd8c71f` found that `web add-consumer-auth` replaces the HQ-only session route, restoring the first-sign-in denial, and that two generated guidance strings still described the old sync-only path. The correction carries the same allowlist helper into the consumer scaffold, grants/reconciles a verified Google account there while ordinary consumers keep access to `/app`, refreshes the consumer client token once before cookie creation, and corrects the guidance. A stale removed role is cleared and refresh tokens revoked before a new consumer session can be minted. The generated route and client are executed in focused tests; the consumer scaffold is checked for nested and root-level manifest imports. After the correction, `pnpm exec vitest run tests/web-provision.test.ts tests/web-scaffold.test.ts tests/web-hq-signin.test.ts tests/consumer-auth.test.ts` passed 84 tests, `pnpm typecheck` and `pnpm compile` passed, and `pnpm morpheus pm index` reported unchanged indexes. The initial reviewer required a same-reviewer follow-up before clearance.

The second reviewer turn found a stored-claim edge: a roleless ID token could predate an `access sync` grant, so comparing only token and desired role would leave a removed user's stored grant intact. The generated consumer route now compares the stored Firebase claim on every sign-in as well, clears and revokes a removed grant even when the token has no role, and refuses the stale session. A behavioral test pins that exact case. Focused tests passed 85/85, and typecheck, compile and index passed again. This is the late substantive correction for the third and final reviewer turn.

The same reviewer cleared HQ-1 and HQ-2 on the third turn at `cdf09a7f345f9e7bd6631e64d95d50886fac9b0b`, independently passing 44 focused HQ and consumer-auth tests. Final-head CI remains the release check.

The initial review found a consumer-auth scaffold path that lost first-sign-in role grants and stale generated guidance. The first follow-up cleared the guidance but found a stored-claim edge. The third and final same-reviewer turn cleared both findings at cdf09a7 after a focused regression test; no findings remain.

```morpheus-review
{
  "version": 2,
  "base": "a3ef1b0739966de8f294699902f528ccbeb55744",
  "reviewed": "547cad838a4053d877b0f49eb51eb0087fd8c71f",
  "covered": "cdf09a7f345f9e7bd6631e64d95d50886fac9b0b",
  "authorSession": "01a13e64-2d9b-7730-abce-2287983ca7aa",
  "reviewerSession": "/root/hq_first_signin_review",
  "risk": "high",
  "elapsedMinutes": 4.183333333333334,
  "timing": {
    "source": "clock",
    "durationMs": 251000,
    "evidence": "Author clock at initial dispatch 2026-10-15 08:48:17 UTC; reviewer completion had been delivered before focused test start logged at 08:52:28 UTC. This is a conservative observed upper bound."
  },
  "outcome": "complete",
  "summary": "The initial review found a consumer-auth scaffold path that lost first-sign-in role grants and stale generated guidance. The first follow-up cleared the guidance but found a stored-claim edge. The third and final same-reviewer turn cleared both findings at cdf09a7 after a focused regression test; no findings remain.",
  "findings": [
    {
      "id": "HQ-1",
      "severity": "substantive",
      "description": "Consumer-auth scaffolding superseded the HQ session route without reconciling allowlisted roles, and its first correction missed stored claims when an older token had no role.",
      "paths": ["src/web/consumer-auth/scaffold.ts", "src/web/consumer-auth/templates-app.ts", "src/web/consumer-auth/templates-lib.ts"],
      "disposition": "fixed",
      "response": "The consumer scaffold carries the HQ allowlist; its session route compares deployed, token and stored roles before minting a cookie; the client force-refreshes a newly granted token. A removed stored role is cleared and revoked even when the token lacks it. The same reviewer cleared this after the focused 85-test run."
    },
    {
      "id": "HQ-2",
      "severity": "minor",
      "description": "Generated setup notes and README still said first sign-in fails until access sync.",
      "paths": ["src/web/scaffold.ts", "src/web/templates.ts"],
      "disposition": "fixed",
      "response": "Both generated messages now describe the first-sign-in grant and access sync for prompt bulk changes; the reviewer cleared them in the first follow-up."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "/root/hq_first_signin_review",
      "commit": "4f605bbe434c241ff3d34dc2ca861d048deb76b5",
      "outcome": "blocked",
      "elapsedMinutes": 0.8833333333333333,
      "timing": {
        "source": "clock",
        "durationMs": 53000,
        "evidence": "Author clock at follow-up dispatch 2026-10-15 08:54:06 UTC; reviewer completion delivered before focused test start logged at 08:54:59 UTC. Conservative observed upper bound."
      },
      "summary": "HQ-2 cleared. HQ-1 remained blocked because a roleless old token could hide a stored role granted later by access sync."
    },
    {
      "reviewerSession": "/root/hq_first_signin_review",
      "commit": "cdf09a7f345f9e7bd6631e64d95d50886fac9b0b",
      "outcome": "cleared",
      "elapsedMinutes": 0.31666666666666665,
      "timing": {
        "source": "clock",
        "durationMs": 19000,
        "evidence": "Author clock during final reviewer invocation 2026-10-15 08:56:15 UTC; completion observed at 08:56:34 UTC. This measures the visible final interval."
      },
      "summary": "Stored-role reconciliation and the exact regression test clear HQ-1; HQ-2 remains clear. No further findings."
    }
  ]
}
```
