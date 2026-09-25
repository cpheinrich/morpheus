import { test } from "node:test";
import assert from "node:assert/strict";
import { identity, stopOrphan } from "../src/processes.mjs";
test("stale or missing process identity cannot signal an unrelated process", async () => {
  const own = await identity(process.pid);
  assert.equal(typeof own, "string");
  assert.equal(
    await stopOrphan({
      claudePid: process.pid,
      claudeIdentity: "a stale different process",
    }),
    false,
  );
  assert.equal(await stopOrphan({ claudePid: process.pid }), false);
  assert.equal(await identity(-1), null);
  assert.equal(await identity(1), null);
});
