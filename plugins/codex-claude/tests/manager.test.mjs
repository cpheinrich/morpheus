import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Manager } from "../src/service.mjs";
import {
  initStore,
  configWrite,
  taskRead,
  taskWrite,
  runDir,
  atomic,
} from "../src/store.mjs";
import { defaults } from "../src/config.mjs";
import { randomUUID } from "node:crypto";
test("supervision permits justified clarification but never implicit tool approval", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "manager-"));
  process.env.CODEX_CLAUDE_HOME = root;
  t.after(() => rm(root, { recursive: true, force: true }));
  await initStore();
  await configWrite({
    ...defaults(),
    mode: "manual",
    maxSupervisionReplies: 1,
  });
  const m = new Manager();
  const sent = [];
  m.send = (run, message) => sent.push(message);
  const id = randomUUID();
  await import("node:fs/promises").then((f) => f.mkdir(runDir(id)));
  const r = {
    id,
    threadId: "task",
    state: "needs_input",
    question: {
      id: "q",
      request: { tool_name: "Bash", input: { command: "echo x" } },
    },
  };
  m.runs.set(id, r);
  await assert.rejects(
    m.answer({
      runId: id,
      questionId: "q",
      source: "codex",
      reason: "routine",
    }),
    /user approval/,
  );
  assert.equal(sent.length, 0);
  r.question.request = {
    tool_name: "AskUserQuestion",
    input: { questions: [{ question: "Color?" }] },
  };
  await assert.rejects(
    m.answer({
      runId: id,
      questionId: "old",
      source: "codex",
      reason: "routine",
    }),
    /Stale/,
  );
  await assert.rejects(
    m.answer({ runId: id, questionId: "q", source: "codex" }),
    /Record why/,
  );
  await m.answer({
    runId: id,
    questionId: "q",
    source: "codex",
    reason: "Reversible test fixture choice",
    answers: { "Color?": "Blue" },
  });
  assert.deepEqual(sent[0].message.response.response.updatedInput.answers, {
    "Color?": "Blue",
  });
  assert.equal(r.question, null);
  assert.equal((await taskRead("task")).supervisionReplies, 1);
  r.question = {
    id: "q2",
    request: { tool_name: "AskUserQuestion", input: {} },
  };
  await assert.rejects(
    m.answer({
      runId: id,
      questionId: "q2",
      source: "codex",
      reason: "routine",
    }),
    /limit/,
  );
  const audit = JSON.parse(
    await readFile(join(runDir(id), "answer-1.json"), "utf8"),
  );
  assert.equal(audit.source, "codex");
  assert.equal(audit.reason, "Reversible test fixture choice");
});
test("persisted state recovers exited runs without replaying work", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "recovery-"));
  process.env.CODEX_CLAUDE_HOME = root;
  t.after(() => rm(root, { recursive: true, force: true }));
  await initStore();
  const id = randomUUID();
  await import("node:fs/promises").then((f) => f.mkdir(runDir(id)));
  await atomic(join(runDir(id), "run.json"), {
    id,
    terminal: false,
    state: "running",
  });
  await atomic(join(runDir(id), "process.json"), { state: "exited" });
  const m = new Manager();
  assert.deepEqual(await m.status(id), {
    id,
    terminal: true,
    state: "interrupted",
  });
  assert.equal(m.runs.size, 0);
});
