import assert from "node:assert/strict";
import test from "node:test";
import { pullRequestsInEvidence } from "../src/fleet-display.mjs";

test("keeps only bounded exact GitHub pull references from evidence", () => {
  assert.deepEqual(pullRequestsInEvidence([
    "PR: https://github.com/Team/Repo/pull/42",
    "[same](https://github.com/team/repo/pull/42)",
    "https://github.com/team/repo/pull/43/files https://github.com/team/repo/pull/44?token=private",
    "https://github.com/team/../pull/12 https://github.com.evil.example/team/repo/pull/45",
    "https://github.com/team/repo/pull/9007199254740992",
    "https://github.com/team/repo/pull/46",
  ]), [{ repository: "team/repo", number: 42 }, { repository: "team/repo", number: 46 }]);
});
