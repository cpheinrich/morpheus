import { spawn } from "node:child_process";
import { fetchStudioRevision } from "./fleet-source.mjs";
import { once } from "node:events";
import { isAbsolute } from "node:path";
import { createInterface } from "node:readline";

const maxLine = 12 * 1024 * 1024;
const noLaunch = () => ({ terminationVerified: true, result: { outcome: "failed", summary: "Studio did not start the worker." } });

function validExecution(config) {
  return /^[a-z_][a-z0-9_-]*$/.test(config.account) && config.account !== "root" &&
    [config.node, config.script, config.workerConfig].every((path) => typeof path === "string" && isAbsolute(path)) &&
    /^[a-zA-Z0-9_-]{1,128}$/.test(config.project) &&
    (config.sourceMirror === undefined || isAbsolute(config.sourceMirror));
}

async function readExecution(stdout, stop) {
  const lines = createInterface({ input: stdout, crlfDelay: Infinity });
  let outcome;
  const artifacts = [];
  let invalid = false;
  for await (const line of lines) {
    try {
      if (line.length > maxLine) throw new Error("Oversized Studio output");
      const value = JSON.parse(line);
      if (value.outcome && !outcome) outcome = value.outcome;
      else if (value.artifact && artifacts.length < 8) artifacts.push(value.artifact);
      else throw new Error("Unexpected Studio output");
    } catch {
      invalid = true;
      stop();
    }
  }
  return { outcome, artifacts, invalid };
}

async function publish(call, { artifacts, outcome }, task, signal) {
  if (signal.aborted || outcome.result?.outcome !== "completed" || !artifacts.length) return outcome;
  const names = [];
  try {
    for (const file of artifacts) {
      if (signal.aborted) return outcome;
      const result = await call("upload", { ...file, taskId: task.id, attemptId: task.attempt.id });
      names.push(result.name);
    }
  } catch {
    return { terminationVerified: true, result: { outcome: "failed", summary: "Studio could not publish the declared artifacts." } };
  }
  return { ...outcome, result: { ...outcome.result, artifacts: names } };
}

function startExecutor(config) {
  return spawn("/usr/bin/sudo", [
    "-n", "-H", "-u", config.account, "--", config.node, config.script, config.workerConfig, config.project,
  ], {
    env: { PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin", LANG: "en_US.UTF-8" },
    stdio: ["pipe", "pipe", "ignore"],
  });
}

async function invoke(config, input, signal) {
  const child = startExecutor(config);
  child.stdin.on("error", () => {});
  const exited = once(child, "close").catch(() => [-1]);
  const stop = () => { if (!child.stdin.writableEnded) child.stdin.end("stop\n"); };
  child.stdin.write(JSON.stringify(input) + "\n");
  signal?.addEventListener("abort", stop, { once: true });
  if (signal?.aborted) stop();
  try {
    const [[code], output] = await Promise.all([exited, readExecution(child.stdout, stop)]);
    if (code === 0 && !output.invalid) return output;
    return null;
  } finally {
    signal?.removeEventListener("abort", stop);
    child.stdin.destroy();
  }
}

function sourceBinding(config, task) {
  if (task.source.project !== config.project || !config.sourceMirror) throw new Error("Source is not enrolled");
  return { mirror: config.sourceMirror, attemptId: task.attempt.id };
}

export function createStudioExecutor(config, call, checkQuota) {
  if (!validExecution(config)) throw new Error("Invalid Studio execution configuration");
  return {
    async prepare(task, signal) {
      if (signal.aborted) return false;
      const checkout = sourceBinding(config, task);
      await fetchStudioRevision(checkout.mirror, task.source.revision);
      if (signal.aborted) return false;
      const output = await invoke(config, { op: "prepare", source: task.source, checkout }, signal);
      return output?.outcome?.prepared === true;
    },
    async execute({ task, admissionId, resume, prompt, signal }) {
      if (signal.aborted) return noLaunch();
      try {
        await checkQuota(task.selection);
      } catch {
        return { terminationVerified: true, result: { outcome: "failed", summary: "Studio gateway quota is unavailable or above the Factory limit." } };
      }
      if (signal.aborted) return noLaunch();
      // Do not serialize the retained brief or mailbox with the current prompt.
      const output = await invoke(config, {
        task: { source: task.source, selection: task.selection }, admissionId, resume, prompt,
        gatewayBaseUrl: config.gatewayBaseUrl,
        checkout: task.source.checkout === "git" ? sourceBinding(config, task) : undefined,
      }, signal);
      if (output?.outcome?.terminationVerified !== true) return { terminationVerified: false };
      return publish(call, output, task, signal);
    },
    async recover(admissionId) {
      const output = await invoke(config, { op: "recover", admissionId });
      return output?.outcome?.admissionId === admissionId && output.outcome.terminationVerified === true;
    },
  };
}
