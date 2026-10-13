import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { recordedSnapshot } from "../src/codex.mjs";
test("desktop adapter accepts active full access metadata by contract", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "snapshot-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, "rollout");
  const start = {
    type: "event_msg",
    payload: { type: "task_started", turn_id: "turn" },
  };
  const context = {
    type: "turn_context",
    timestamp: new Date().toISOString(),
    payload: {
      turn_id: "turn",
      cwd: "/repo",
      model: "gpt-6-astra",
      effort: "medium",
      approval_policy: "never",
      permission_profile: { type: "disabled" },
      sandbox_policy: { type: "danger-full-access" },
      developer_instructions: "PRIVATE",
    },
  };
  const write = async (rows) =>
    writeFile(path, rows.map((r) => JSON.stringify(r)).join("\n"));
  const thread = { id: "task", path, cliVersion: "9.0.0" };
  await write([start, context]);
  const s = await recordedSnapshot(thread);
  assert.equal(s.model, "gpt-6-astra");
  assert.equal(s.reasoningEffort, "medium");
  assert.equal(s.approvalPolicy, "never");
  assert.equal(JSON.stringify(s).includes("PRIVATE"), false);
  assert.equal(s.settingsSource, "recorded-turn-9.0.0");
  await write([
    start,
    { ...context, payload: { ...context.payload, model: undefined } },
  ]);
  await assert.rejects(recordedSnapshot(thread), /metadata contract/);
  await write([
    start,
    context,
    { type: "event_msg", payload: { type: "task_complete", turn_id: "turn" } },
  ]);
  await assert.rejects(recordedSnapshot(thread), /No active/);
  await write([start, { ...context, timestamp: "2020-01-01T00:00:00Z" }]);
  await assert.rejects(recordedSnapshot(thread), /No active/);
  await write([
    start,
    {
      ...context,
      payload: {
        ...context.payload,
        sandbox_policy: { type: "workspace-write" },
      },
    },
  ]);
  await assert.rejects(recordedSnapshot(thread), /restricted/);
});
