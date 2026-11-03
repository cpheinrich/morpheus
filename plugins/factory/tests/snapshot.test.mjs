import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import zlib from "node:zlib";
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
  const decompress = Object.getOwnPropertyDescriptor(zlib, "createZstdDecompress");
  try {
    Object.defineProperty(zlib, "createZstdDecompress", { value: undefined, configurable: true });
    await write([start, context]);
    assert.equal((await recordedSnapshot(thread)).model, "gpt-6-astra");
    await writeFile(path + ".zst", "compressed bytes are not read without support");
    await rm(path);
    await assert.rejects(recordedSnapshot(thread), /requires Node 22.15/);
  } finally {
    Object.defineProperty(zlib, "createZstdDecompress", decompress);
  }
  // The same validation must run after Codex compresses the rollout in place.
  await writeFile(path + ".zst", zlib.zstdCompressSync(Buffer.from([start, context].map(JSON.stringify).join("\n"))));
  assert.equal((await recordedSnapshot(thread)).model, "gpt-6-astra");
  assert.equal((await recordedSnapshot({ ...thread, path: path + ".zst" })).reasoningEffort, "medium");
  await writeFile(path + ".zst", zlib.zstdCompressSync(Buffer.from([start, context,
    { type: "event_msg", payload: { type: "task_complete", turn_id: "turn" } },
  ].map(JSON.stringify).join("\n"))));
  await assert.rejects(recordedSnapshot(thread), /No active/);
  await writeFile(path + ".zst", "corrupt compressed rollout");
  await assert.rejects(recordedSnapshot(thread));
  await rm(path + ".zst");
  await assert.rejects(recordedSnapshot(thread), /metadata is unavailable/);
});
