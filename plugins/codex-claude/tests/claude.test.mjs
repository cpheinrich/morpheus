import { test } from "node:test";
import assert from "node:assert/strict";
import { subscriptionFromAuthStatus } from "../src/claude.mjs";

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
