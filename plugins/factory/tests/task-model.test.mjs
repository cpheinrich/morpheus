import assert from "node:assert/strict";
import { test } from "node:test";
import { taskIdForAttempt, taskView } from "../src/task-model.mjs";

// A2A 1.0.1, §3.4.2–3.4.3 and the TaskState enum in the normative proto:
// https://github.com/a2aproject/A2A/blob/3303592588e388e62e0f69f701af531d2f4e3991/specification/a2a.proto
// Fixtures are fixed expectations. CI does not fetch a moving upstream schema.
test("reply continues the task, while a brief after completion starts a new one", () => {
  const first = { id: "attempt-1", threadId: "chat", state: "needs_input", terminal: true };
  const taskId = taskIdForAttempt("attempt-2", first);
  assert.equal(taskId, "attempt-1");
  const continuation = { ...first, id: "attempt-2", taskId, state: "completed" };
  assert.deepEqual(taskView(continuation), {
    id: "attempt-1",
    contextId: "chat",
    status: { state: "TASK_STATE_COMPLETED" },
  });
  assert.equal(taskIdForAttempt("attempt-3", continuation), "attempt-3");
});

test("provider output and cleanup uncertainty do not report a settled task", () => {
  const cases = [
    ["starting", false, "TASK_STATE_SUBMITTED"],
    ["running", false, "TASK_STATE_WORKING"],
    ["needs_input", true, "TASK_STATE_INPUT_REQUIRED"],
    ["completed", false, "TASK_STATE_WORKING"],
    ["completed", true, "TASK_STATE_COMPLETED"],
    ["failed", false, "TASK_STATE_WORKING"],
    ["failed", true, "TASK_STATE_FAILED"],
    ["cleanup_pending", false, "TASK_STATE_UNSPECIFIED"],
    ["interrupted", true, "TASK_STATE_UNSPECIFIED"],
  ];
  for (const [state, terminal, expected] of cases) {
    assert.equal(taskView({ id: "attempt-1", threadId: "chat", state, terminal }).status.state, expected, state);
  }
});
