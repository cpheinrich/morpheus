import { spawn } from "node:child_process";
import { once } from "node:events";
import { isAbsolute } from "node:path";
import { createInterface } from "node:readline";

const maxLine = 12 * 1024 * 1024;
const noLaunch = () => ({ terminationVerified: true, result: { outcome: "failed", summary: "Studio did not start the worker." } });

function validExecution(config) {
  return /^[a-z_][a-z0-9_-]*$/.test(config.account) && config.account !== "root" &&
    [config.node, config.script, config.workerConfig].every((path) => typeof path === "string" && isAbsolute(path)) &&
    /^[a-zA-Z0-9_-]{1,128}$/.test(config.project);
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

export function createStudioExecutor(config, call) {
  if (!validExecution(config)) throw new Error("Invalid Studio execution configuration");
  return async function execute({ task, admissionId, resume, prompt, signal }) {
    if (signal.aborted) return noLaunch();
    const child = spawn("/usr/bin/sudo", [
      "-n", "-H", "-u", config.account, "--", config.node, config.script, config.workerConfig, config.project,
    ], {
      env: { PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin", LANG: "en_US.UTF-8" },
      stdio: ["pipe", "pipe", "ignore"],
    });
    child.stdin.on("error", () => {});
    const exited = once(child, "close").catch(() => [-1]);
    const stop = () => { if (!child.stdin.writableEnded) child.stdin.end("stop\n"); };
    child.stdin.write(JSON.stringify({ task, admissionId, resume, prompt }) + "\n");
    signal.addEventListener("abort", stop, { once: true });
    if (signal.aborted) stop();
    try {
      const [[code], output] = await Promise.all([exited, readExecution(child.stdout, stop)]);
      if (code !== 0 || output.invalid || output.outcome?.terminationVerified !== true)
        return { terminationVerified: false };
      return await publish(call, output, task, signal);
    } finally {
      signal.removeEventListener("abort", stop);
      child.stdin.destroy();
    }
  };
}
