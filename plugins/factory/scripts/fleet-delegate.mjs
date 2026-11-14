import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { call } from "../src/client.mjs";
import { home } from "../src/config.mjs";
import { atomic, key, readJSON } from "../src/store.mjs";
import { readPlacement } from "../src/fleet-placement.mjs";
import { checkoutInfo } from "../src/workspace.mjs";
import { fleetControllerPath, fleetOperation } from "./fleet-mcp.mjs";

const states = {
  TASK_STATE_SUBMITTED: "starting",
  TASK_STATE_WORKING: "running",
  TASK_STATE_INPUT_REQUIRED: "needs_input",
  TASK_STATE_COMPLETED: "completed",
  TASK_STATE_FAILED: "failed",
  TASK_STATE_CANCELED: "canceled",
};
const runPath = (id) => join(home(), "fleet-runs", `${id}.json`);
const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, ...args], {
  encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"],
}).trim();

export async function fleetTarget(config, cwd) {
  if (!isAbsolute(cwd ?? "")) throw new Error("Fleet delegation requires the absolute claimed checkout path.");
  const target = await checkoutInfo(cwd);
  const candidates = [];
  for (const [project, anchor] of Object.entries(config.projects ?? {})) {
    if (await checkoutInfo(anchor).then(({ project }) => project, () => null) === target.project)
      candidates.push(project);
  }
  if (candidates.length !== 1) throw new Error("Checkout has no unique local fleet enrollment.");
  if (target.top !== target.cwd || !target.linked || git(target.cwd, "status", "--porcelain"))
    throw new Error("Fleet delegation requires a clean linked checkout at its committed revision.");
  return { project: candidates[0], revision: git(target.cwd, "rev-parse", "HEAD") };
}

function projectRun({ task, question, pending }, runId) {
  if (pending) return { runId, placement: "fleet", pending };
  const state = states[task.state] ?? "interrupted";
  return {
    id: task.id, runId: task.id, placement: "fleet", state, selection: task.selection,
    terminal: ["completed", "failed", "canceled"].includes(state),
    hostId: (task.attempt ?? task.lastAttempt)?.hostId, result: task.result,
    source: task.source, question,
    task: { id: task.id, contextId: task.contextId, status: { state: task.state } },
  };
}

function checkOptions(args) {
  if (args.provider === "claude" || args.repos?.length || args.effort || args.speed === "fast" ||
      args.fresh || args.background)
    throw new Error("This fleet route supports one checkout and the enrolled Codex worker settings.");
}

async function submit(method, args, authorize) {
  checkOptions(args);
  const { readFleetConfig } = await import("../src/fleet-client.mjs");
  const config = await readFleetConfig(fleetControllerPath()).catch(error => {
    if (error.code === "ENOENT") throw new Error("No Fleet enrollment exists on this controller. Use explicit local placement only if requested.");
    throw error;
  });
  const target = await fleetTarget(config, args.cwd);
  if (method === "inspect") {
    await authorize("factory.remoteAuthorize", {
      rootId: args.rootId, projectPath: config.projects[target.project], checkoutPath: args.cwd,
    });
    return { placement: "fleet", target, admission: "pending", availability: "unknown", quota: null,
      reason: "Local source preflight passed. The service validates enrollment at submission and Studio checks quota before launch." };
  }
  const result = await fleetOperation(args.rootId, {
    op: "submit", ...target, text: args.prompt, model: args.model, messageId: args.messageId ?? randomUUID(),
  }, { checkoutPath: args.cwd });
  await mkdir(join(home(), "fleet-runs"), { recursive: true, mode: 0o700 });
  await atomic(runPath(result.task.id), { rootId: args.rootId, checkoutPath: args.cwd });
  return projectRun(result, result.task.id);
}

async function reply(method, args, checkoutPath) {
  const body = { taskId: args.runId };
  const { task } = await fleetOperation(args.rootId, { ...body, op: "get" });
  const source = method === "delegate" ? args.replySource : args.source;
  const reason = method === "delegate" ? args.replyReason : args.reason;
  const text = method === "delegate" ? args.prompt : args.answers?.[task.questionId] ??
    Object.values(args.answers ?? {}).join("\n");
  if (!["root", "user"].includes(source) || !reason?.trim() || !text?.trim() || args.allow === false ||
      (args.questionId && args.questionId !== task.questionId) || !task.attempt || !task.questionId)
    throw new Error("The fleet task requires an attributed reply to its current clarification.");
  const response = await fleetOperation(args.rootId, {
    ...body, op: "answer", attemptId: task.attempt.id, questionId: task.questionId, text,
    messageId: key(`${task.questionId}\0${source}\0${text}`),
  }, { checkoutPath });
  if (response.reason) throw new Error(`Fleet reply refused: ${response.reason}`);
  return projectRun(await fleetOperation(args.rootId, { ...body, op: "get" }), args.runId);
}

export async function dispatchFleet(method, args, { authorize = call } = {}) {
  if (!args.runId) {
    const placement = args.placement ?? await readPlacement();
    return placement === "fleet" ? submit(method, args, authorize) : undefined;
  }
  const record = await readJSON(runPath(args.runId), null);
  if (!record) {
    if (args.placement === "fleet") throw new Error("No fleet run matches this ID.");
    return undefined;
  }
  if (record.rootId !== args.rootId || args.placement === "local") throw new Error("Fleet run is outside this route or root.");
  if (method === "answer" || method === "delegate") return reply(method, args, record.checkoutPath);
  const body = { taskId: args.runId };
  if (method === "stop") {
    const response = await fleetOperation(args.rootId, { ...body, op: "cancel" });
    if (response.reason) throw new Error(`Fleet cancellation refused: ${response.reason}`);
    return { stopping: args.runId };
  }
  const snapshot = await fleetOperation(args.rootId, { ...body, op: method === "wait" ? "wait" : "get" }, { seconds: args.seconds });
  return projectRun(snapshot, args.runId);
}
