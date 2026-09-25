import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkClaude, subscriptionFromAuthStatus } from "../src/claude.mjs";

test("Claude authentication status requires a direct live subscription login", () => {
  assert.equal(
    subscriptionFromAuthStatus(
      JSON.stringify({
        loggedIn: true,
        authMethod: "claude.ai",
        apiProvider: "firstParty",
        subscriptionType: "max",
      }),
    ),
    "max",
  );
  assert.throws(
    () =>
      subscriptionFromAuthStatus(
        JSON.stringify({
          loggedIn: false,
          authMethod: "none",
          apiProvider: "firstParty",
        }),
      ),
    /claude auth login/,
  );
  assert.throws(() => subscriptionFromAuthStatus("not-json"), /valid JSON/);
});

test("Claude authentication preserves structured status from a nonzero exit", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "claude-auth-"));
  const previous = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = root;
  t.after(async () => {
    if (previous === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = previous;
    await rm(root, { recursive: true, force: true });
  });
  const run = async () => {
    const error = new Error("command exited 1");
    error.stdout = JSON.stringify({
      loggedIn: false,
      authMethod: "none",
      apiProvider: "firstParty",
    });
    throw error;
  };
  await assert.rejects(checkClaude(root, run), /claude auth login/);
});
