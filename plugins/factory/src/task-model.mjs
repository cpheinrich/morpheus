// The first attempt supplies the task's ID. A continuation gets a new attempt
// ID but retains the logical task. Old records have no explicit task ID.
export function taskIdForAttempt(attemptId, previous) {
  if (previous?.state === "needs_input") return previous.taskId ?? previous.id;
  return attemptId;
}

const terminalStatus = new Map([
  ["completed", "TASK_STATE_COMPLETED"],
  ["failed", "TASK_STATE_FAILED"],
  ["canceled", "TASK_STATE_CANCELED"],
]);

export function taskState(attempt) {
  if (attempt.state === "needs_input") return "TASK_STATE_INPUT_REQUIRED";
  if (attempt.state === "starting") return "TASK_STATE_SUBMITTED";
  if (attempt.state === "running") return "TASK_STATE_WORKING";
  const settled = terminalStatus.get(attempt.state);
  if (settled) return attempt.terminal === true ? settled : "TASK_STATE_WORKING";
  // Cleanup uncertainty and an unclassified interruption are not user questions
  // or proof of successful cancellation.
  return "TASK_STATE_UNSPECIFIED";
}

// The v1 task vocabulary is additive on the legacy MCP response. Use only the
// conversation identity and the lifecycle projection, not provider session IDs.
export function taskView(attempt) {
  return {
    id: attempt.taskId ?? attempt.id,
    contextId: attempt.threadId,
    status: { state: taskState(attempt) },
  };
}
