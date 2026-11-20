import { spawn } from "node:child_process";
import { notLaunched } from "./fleet-receipt.mjs";
import { enrolledWorkspace } from "./fleet-workspace-checkout.mjs";
import { fetchWorkspaceRevision, fetchStudioRevision } from "./fleet-source.mjs";
import { realpathSync, statSync } from "node:fs";
import { once } from "node:events";
import { isAbsolute } from "node:path";
import { createInterface } from "node:readline";

const maxLine = 12 * 1024 * 1024;
const noLaunch = (admissionId) => ({ terminationVerified: true, invocation: notLaunched(admissionId), result: { outcome: "failed", summary: "Studio did not start the worker." } });

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

async function publish(call, { artifacts, outcome }, task, signal, canPublish = () => true) {
  const deadline = outcome.diagnosticCode === "deadline_reached";
  if (signal.aborted || !canPublish() || !artifacts.length || (outcome.result?.outcome !== "completed" && !deadline)) return outcome;
  const names = [];
  try {
    for (const file of artifacts) {
      if (signal.aborted || !canPublish()) return outcome;
      const result = await call("upload", { ...file, taskId: task.id, attemptId: task.attempt.id });
      names.push(result.name);
    }
  } catch {
    if (deadline) return { ...outcome, result: { ...outcome.result, artifacts: names } };
    return { ...outcome, result: { outcome: "failed", summary: "Studio could not publish the declared artifacts." } };
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
  let child;
  try { child = startExecutor(config); }
  catch { return null; }
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

function attemptBinding(task) {
  return { taskId: task.id, attemptId: task.attempt.id, ...(task.source.workspace ? { workspace: task.source.workspace } : {}) };
}

function checkoutFor(config, task) {
  if (task.source.workspace) return { attemptId: task.attempt.id };
  if (task.source.checkout === "git") return sourceBinding(config, task);
}

export function createStudioExecutor(config, call, checkQuota) {
  if (!validExecution(config)) throw new Error("Invalid Studio execution configuration");
  return {
    async prepare(task, signal) {
      if (signal.aborted) return false;
      let checkout;
      try {
        if (task.source.workspace) {
          const { workspace, config: host } = enrolledWorkspace(config.fleetWorkspace, task.source.workspace, config.fleetWorkspace?.policy.sandbox);
          checkout = { attemptId: task.attempt.id };
          for (const repo of workspace.repositories) {
            if (signal.aborted) return false;
            await fetchWorkspaceRevision(host.mirrors[repo.project], repo);
          }
        } else {
          if (config.fleetWorkspace) throw new Error("Workspace binding required");
          checkout = sourceBinding(config, task);
          Object.assign(checkout, await fetchStudioRevision(checkout.mirror, task.source.revision));
        }
      } catch { return { prepared: false, diagnosticCode: "source_fetch_failed" }; }
      if (signal.aborted) return false;
      const output = await invoke(config, { op: "prepare", source: task.source, checkout }, signal);
      return output?.outcome?.prepared === true ? true : { prepared: false, diagnosticCode: output ? "checkout_failed" : "executor_invocation_failed" };
    },
    async execute({ task, admissionId, resume, prompt, signal }) {
      if (signal.aborted) return noLaunch(admissionId);
      try {
        if (task.selection.provider !== "claude") await checkQuota(task.selection);
      } catch {
        return { terminationVerified: true, invocation: notLaunched(admissionId), result: { outcome: "failed", summary: "Studio gateway quota is unavailable or above the Factory limit." } };
      }
      if (signal.aborted) return noLaunch(admissionId);
      if (task.source.workspace) {
        try { enrolledWorkspace(config.fleetWorkspace, task.source.workspace, config.fleetWorkspace?.policy.sandbox); }
        catch { return { ...noLaunch(admissionId), diagnosticCode: "workspace_policy_mismatch" }; }
      } else if (config.fleetWorkspace) return { ...noLaunch(admissionId), diagnosticCode: "workspace_policy_mismatch" };
      // Do not serialize the retained brief or mailbox with the current prompt.
      const output = await invoke(config, {
        task: { source: task.source, selection: task.selection }, admissionId, resume, prompt,
        binding: attemptBinding(task),
        gatewayBaseUrl: task.selection.provider === "claude" ? config.claudeGatewayBaseUrl : config.gatewayBaseUrl,
        checkout: checkoutFor(config, task),
      }, signal);
      if (!output) return { terminationVerified: false, diagnosticCode: "executor_invocation_failed" };
      if (output.outcome?.terminationVerified !== true) return { terminationVerified: false };
      return publish(call, output, task, signal);
    },
    async recover(admissionId, task, restore) {
      const recovery = restore?.canPublish() ? { source: task.source, checkout: checkoutFor(config, task) } : undefined;
      const output = await invoke(config, { op: "recover", admissionId, binding: attemptBinding(task), recovery }, recovery ? restore.signal : undefined);
      const outcome = output?.outcome;
      if (outcome?.admissionId !== admissionId || outcome.terminationVerified !== true) return false;
      return recovery && restore.canPublish() && outcome.invocation?.launch === "session"
        ? publish(call, output, task, restore.signal, restore.canPublish) : outcome;
    },
  };
}


function mirrorIdentity(path) {
  const { dev, ino } = statSync(path, { bigint: true });
  return `${dev}:${ino}`;
}

function additionalRoute(primary, fields, project) {
  const { account, sourceMirror, workerConfig, fleetWorkspace } = fields ?? {};
  const route = { ...primary, account, sourceMirror, workerConfig, project };
  delete route.fleetWorkspace;
  if (fleetWorkspace) route.fleetWorkspace = fleetWorkspace;
  return route;
}

export function createStudioExecutors(config, call, checkQuota, create = createStudioExecutor) {
  const { additionalGitProjects = {}, ...primary } = config;
  if (!additionalGitProjects || Object.getPrototypeOf(additionalGitProjects) !== Object.prototype)
    throw new Error("Invalid additional Studio Git projects");

  const fallback = create(primary, call, checkQuota);
  const git = new Map();
  const accounts = new Set([primary.account]);
  const mirrors = new Set();
  if (primary.sourceMirror && Object.keys(additionalGitProjects).length)
    mirrors.add(mirrorIdentity(primary.sourceMirror));
  for (const [project, fields] of Object.entries(additionalGitProjects)) {
    const route = additionalRoute(primary, fields, project);
    const { account, sourceMirror } = route;
    if (project === primary.project || typeof account !== "string" || accounts.has(account) ||
        typeof sourceMirror !== "string" || !validExecution(route))
      throw new Error("Invalid or duplicate additional Studio Git route");
    const canonical = realpathSync(sourceMirror);
    const identity = mirrorIdentity(canonical);
    if (mirrors.has(identity)) throw new Error("Duplicate Studio Git mirror");
    git.set(project, create({ ...route, sourceMirror: canonical }, call, checkQuota));
    accounts.add(account);
    mirrors.add(identity);
  }
  const select = ({ source } = {}) => {
    if (source?.project === primary.project) return fallback;
    if (source?.checkout === "git") return git.get(source.project);
  };

  return {
    async prepare(task, signal) {
      return select(task)?.prepare(task, signal) ?? false;
    },
    async execute(input) {
      return select(input.task)?.execute(input) ?? noLaunch(input.admissionId);
    },
    async recover(admissionId, task, restore) {
      return select(task)?.recover(admissionId, task, restore) ?? false;
    },
  };
}
