import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setImmediate } from "node:timers/promises";
import { test } from "node:test";
import { createFleetRunner } from "../src/fleet-runner.mjs";

const taskId = "01890000-0000-7000-8000-000000000001";
const attemptId = "01890000-0000-7000-8000-000000000002";
const admissionId = "01890000-0000-7000-8000-000000000003";
const working = "TASK_STATE_WORKING";
const awaiting = "TASK_STATE_INPUT_REQUIRED";
const uncertain = "TASK_STATE_UNSPECIFIED";
const output = (outcome, extra = {}) => ({
  terminationVerified: true,
  sessionId: "native-session-id",
  result: { outcome, summary: "Worker response", ...extra },
});

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "factory-runner-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const journalPath = join(dir, "runner.json");
  const task = { id: taskId, state: "TASK_STATE_SUBMITTED", brief: { text: "private brief" } };
  const calls = [];
  const executions = [];
  const starts = Array.from({ length: 2 }, () => Promise.withResolvers());
  let answer;
  let allowRenew = true;
  const handlers = {
    heartbeat: ({ available }) => ({ tasks: available ? [taskId] : [] }),
    claim: ({ attemptId: id }) => {
      if (task.attempt) return { attempt: task.attempt, replay: true };
      task.state = working;
      task.attempt = { id };
      return { attempt: task.attempt, replay: false, task };
    },
    inspect: () => ({ task, answer }),
    renew: () => ({ renewed: allowRenew }),
    question: ({ questionId }) => {
      task.state = awaiting;
      task.questionId = questionId;
      task.answerId = null;
      return { replay: false };
    },
    finish: ({ cleanupVerified, outcome, result }) => {
      task.state = cleanupVerified ? outcome : uncertain;
      if (cleanupVerified) {
        task.result = result;
        task.lastAttempt = task.attempt;
        task.attempt = null;
      }
      return { settled: cleanupVerified };
    },
  };
  const options = {
    journalPath,
    async call(operation, body) {
      calls.push([operation, structuredClone(body)]);
      return handlers[operation](body);
    },
    async execute(args) {
      const journal = JSON.parse(await readFile(journalPath, "utf8"));
      const turn = Promise.withResolvers();
      const execution = { ...args, journal, resolve: turn.resolve };
      executions.push(execution);
      starts[executions.length - 1]?.resolve(execution);
      return turn.promise;
    },
  };
  const runner = createFleetRunner(options);
  return {
    runner, options, task, calls, executions,
    started: (index = 0) => starts[index].promise,
    journal: async () => JSON.parse(await readFile(journalPath, "utf8")),
    respond(text) {
      answer = { messageId: "reply", replyTo: task.questionId, text };
      task.answerId = answer.messageId;
      task.state = working;
    },
    loseLease() { allowRenew = false; },
  };
}

test("persists the exact attempt and admission before one execution and publishes only its verified result", async (t) => {
  const { runner, options, task, calls, executions, started } = await fixture(t);
  const firstTick = runner.tick();
  assert.equal(await runner.tick(), "busy");
  assert.equal(await firstTick, "running");
  const run = await started();
  assert.equal(executions.length, 1);
  assert.deepEqual(run.journal, {
    version: 1, taskId, attemptId: task.attempt.id, phase: "running",
    admissionId: run.admissionId, answerId: null,
  });
  assert.equal(run.resume, null);
  assert.equal(run.prompt, "private brief");
  const artifacts = [{ name: "report.pdf", generation: "42" }];
  run.resolve(output("completed", { artifacts }));
  await setImmediate();
  assert.equal(await runner.tick(), "settled");
  assert.deepEqual(calls.at(-1), ["finish", {
    taskId, attemptId: run.journal.attemptId, outcome: "TASK_STATE_COMPLETED",
    result: { summary: "Worker response", artifacts }, cleanupVerified: true,
  }]);
  await assert.rejects(readFile(options.journalPath), { code: "ENOENT" });
});

test("a verified clarification resumes on its exact previous admission with a fresh admission ID", async (t) => {
  const { runner, options, task, executions, journal, respond, started } = await fixture(t);
  assert.equal(await runner.tick(), "running");
  const first = await started();
  first.resolve(output("needs_input", { question: "Which fixture?" }));
  await setImmediate();
  assert.equal(await runner.tick(), "waiting");
  assert.equal((await journal()).questionId, task.questionId);
  assert.equal((await journal()).admissionId, first.admissionId);
  assert.equal(task.state, awaiting);

  respond("private reply");
  // Waiting is a verified process exit, so an owned answer is resumable after
  // the host restarts, without relaunching the old admission.
  const restarted = createFleetRunner(options);
  assert.equal(await restarted.tick(), "running");
  const second = await started(1);
  assert.equal(second.resume, first.admissionId);
  assert.notEqual(second.admissionId, first.admissionId);
  assert.equal(second.journal.attemptId, first.journal.attemptId);
  assert.equal(second.journal.answerId, "reply");
  assert.equal(second.prompt, "private reply");
  assert.equal(executions.length, 2);
});

test("a cancellation signals the worker and only verified cleanup releases the attempt", async (t) => {
  const { runner, task, calls, started, journal } = await fixture(t);
  await runner.tick();
  const run = await started();
  task.cancelRequestedAt = 1;
  assert.equal(await runner.tick(), "running");
  assert.equal(run.signal.aborted, true);
  assert.equal(calls.some(([operation]) => operation === "finish"), false);
  run.resolve({ terminationVerified: false });
  await setImmediate();
  assert.equal(await runner.tick(), "held");
  assert.equal(calls.at(-1)[1].cleanupVerified, false);
  assert.equal(task.state, uncertain);
  assert.equal((await journal()).admissionId, run.admissionId);
});

test("a verified stop after cancellation produces canceled rather than completed", async (t) => {
  const { runner, task, calls, started } = await fixture(t);
  await runner.tick();
  const run = await started();
  task.cancelRequestedAt = 1;
  await runner.tick();
  run.resolve(output("completed"));
  await setImmediate();
  assert.equal(await runner.tick(), "settled");
  assert.equal(calls.at(-1)[1].outcome, "TASK_STATE_CANCELED");
  assert.equal(calls.at(-1)[1].cleanupVerified, true);
});

test("restart after the durable launch boundary holds the attempt without replay", async (t) => {
  const { options, task, executions, calls, journal } = await fixture(t);
  task.attempt = { id: attemptId };
  task.state = working;
  await writeFile(options.journalPath, JSON.stringify({
    version: 1, taskId, attemptId, phase: "running", admissionId,
  }), { mode: 0o600 });
  assert.equal(await createFleetRunner(options).tick(), "held");
  assert.equal(calls.at(-1)[1].cleanupVerified, false);
  assert.equal((await journal()).admissionId, admissionId);
  assert.deepEqual(executions, []);
});

test("restart before the durable launch boundary releases a replayed claim without spawning", async (t) => {
  const { options, task, executions, calls } = await fixture(t);
  task.attempt = { id: attemptId };
  task.state = working;
  await writeFile(options.journalPath, JSON.stringify({
    version: 1, taskId, attemptId, phase: "claiming",
  }), { mode: 0o600 });
  assert.equal(await createFleetRunner(options).tick(), "settled");
  assert.equal(calls.at(-1)[1].cleanupVerified, true);
  assert.deepEqual(executions, []);
});

test("lease loss aborts execution and prevents publishing even a later verified success", async (t) => {
  const { runner, started, loseLease, calls } = await fixture(t);
  await runner.tick();
  const run = await started();
  loseLease();
  assert.equal(await runner.tick(), "held");
  assert.equal(run.signal.aborted, true);
  run.resolve(output("completed", { artifacts: [{ name: "stale.pdf" }] }));
  await setImmediate();
  assert.equal(await runner.tick(), "settled");
  assert.deepEqual(calls.at(-1)[1].result, { summary: "Runner lease could not be renewed." });
  assert.equal(calls.at(-1)[1].outcome, "TASK_STATE_FAILED");
});

test("restart settles the exact admission once its cleanup is proven without executing again", async (t) => {
  const { options, task, executions, calls } = await fixture(t);
  task.attempt = { id: attemptId };
  task.state = working;
  task.source = { project: "project-two", checkout: "git" };
  await writeFile(options.journalPath, JSON.stringify({
    version: 1, taskId, attemptId, phase: "running", admissionId,
  }), { mode: 0o600 });
  let verified = false;
  const reads = [];
  const runner = createFleetRunner({ ...options, recover: async (id, observed) => { reads.push([id, observed.source.project]); return verified; } });
  assert.equal(await runner.tick(), "held");
  assert.equal(task.state, uncertain);
  verified = true;
  assert.equal(await runner.tick(), "settled");
  assert.deepEqual(reads, [[admissionId, "project-two"], [admissionId, "project-two"]]);
  assert.deepEqual(executions, []);
  assert.deepEqual(calls.filter(([op]) => op === "finish").map(([, body]) => body.cleanupVerified), [false, true]);
  await assert.rejects(readFile(options.journalPath), { code: "ENOENT" });
});

test("restart during source preparation settles as never launched", async (t) => {
  const { options, task, executions, journal, calls } = await fixture(t);
  task.source = { checkout: "git" };
  const started = Promise.withResolvers();
  const release = Promise.withResolvers();
  const recover = () => assert.fail("no guardian was launched");
  const runner = createFleetRunner({
    ...options, recover,
    async prepare() { started.resolve(); return release.promise; },
  });
  assert.equal(await runner.tick(), "preparing");
  await started.promise;
  const record = await journal();
  assert.equal(record.phase, "preparing");
  assert.equal(record.admissionId, undefined);
  const restarted = createFleetRunner({ ...options, recover });
  assert.equal(await restarted.tick(), "settled");
  assert.equal(task.state, "TASK_STATE_FAILED");
  assert.equal(calls.at(-1)[1].cleanupVerified, true);
  assert.equal(executions.length, 0);
  release.resolve(true);
});
