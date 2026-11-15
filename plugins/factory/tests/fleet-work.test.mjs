import assert from "node:assert/strict";
import test from "node:test";
import { readFleetWork } from "../src/fleet-work.mjs";

test("prefers the settled result when live and history reads straddle completion", async () => {
  const id = "90000000-0000-4000-8000-000000000001";
  const now = 1000;
  const docs = state => [{ id, data: () => ({
    source: { project: "pilot" }, state, createdAt: now - 50,
    attempt: state === "TASK_STATE_WORKING" ? { leaseUntil: now + 50 } : null,
  }) }];
  const branch = state => ({ orderBy: () => ({ limit: () => ({ get: async () => ({ docs: docs(state) }) }) }) });
  const projection = { where: (_field, _operator, states) => branch(
    states.includes("TASK_STATE_WORKING") ? "TASK_STATE_WORKING" : "TASK_STATE_COMPLETED",
  ) };
  const db = { collection: () => ({ where: () => ({ select: () => projection }) }) };
  const answer = await readFleetWork(db, { project: "pilot", repository: "fixture/pilot" }, now);
  assert.equal(answer.status, "available");
  assert.deepEqual(answer.tasks.map(task => [task.id, task.state]), [[id, "succeeded"]]);
});
