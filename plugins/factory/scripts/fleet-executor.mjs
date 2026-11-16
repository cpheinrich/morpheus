// Runs as the unprivileged execution account. The fixed argv paths are
// installed by the host operator; the supervisor supplies one JSON line.
import { execFileSync } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { gatewayWorker, readWorkerConfig, reconcileWorker, workerResult } from "../src/gateway-worker.mjs";
import { readArtifactFiles, readCheckpointFiles } from "../src/fleet-artifacts.mjs";
import { checkoutWorkspace } from "../src/fleet-workspace-checkout.mjs";
import { studioCheckout } from "../src/fleet-source.mjs";
import { invocationFromWorker, notLaunched } from "../src/fleet-receipt.mjs";
import { gitEnv } from "../src/workspace.mjs";

const [configPath, project] = process.argv.slice(2);
const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
const controller = new AbortController();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const lines = input[Symbol.asyncIterator]();

async function enrolledSandbox(config, source) {
  const { sandbox, authority } = config;
  if (sandbox === "workspace-write") return true;
  if (sandbox !== "danger-full-access" || authority !== "operator" || source.checkout !== "git" || process.getuid() === 0)
    return false;
  const info = await stat(homedir());
  return info.isDirectory() && info.uid === process.getuid() && !(info.mode & 0o077);
}

async function executionCheckout(config, source, checkout) {
  if (source.workspace) return checkoutWorkspace(config.cwd, config.fleetWorkspace, source.workspace, checkout?.attemptId, config.sandbox, true);
  if (config.fleetWorkspace) throw new Error("Workspace binding required");
  const cwd = source.checkout === "git"
    ? await studioCheckout(config.cwd, checkout, source.revision, true) : config.cwd;
  return { cwd };
}

async function prepare({ task, admissionId, resume, prompt, gatewayBaseUrl, checkout }) {
  const config = await readWorkerConfig(configPath);
  if (task.source.project !== project || task.selection.provider !== "codex" ||
      task.selection.model !== config.model || task.selection.gateway !== config.gateway.name ||
      gatewayBaseUrl?.replace(/\/+$/, "") !== config.gateway.baseUrl ||
      !uuid.test(admissionId) || !await enrolledSandbox(config, task.source))
    throw new Error("Studio project or gateway model does not match this enrollment");
  const { cwd, paths } = await executionCheckout(config, task.source, checkout);
  const git = (path, ...args) => execFileSync("git", ["-C", path, ...args], { env: gitEnv(), encoding: "utf8", timeout: 5000 }).trim();
  // Preparation creates the checkouts; reopening them does not imply continuation.
  // Every repository must still be clean immediately before its first invocation.
  if (task.source.revision !== git(cwd, "rev-parse", "HEAD") ||
      (!resume && Object.values(paths ?? { primary: cwd }).some(path => git(path, "status", "--porcelain"))))
    throw new Error("Studio checkout does not match this admission");
  const outputDir = join(cwd, `.factory-artifacts-${admissionId}`);
  await mkdir(outputDir, { mode: 0o700 });
  const handoff = `${prompt}${paths ? `\n\nAuthorized workspace checkouts: ${JSON.stringify(paths)}. Comparison refs are pinned in each checkout. Use morpheus credentials run -- <trusted-command> only for declared companions; keep all repositories on their normal review, CI and release path.` : ""}\n\nFor output artifacts, write files directly in ${outputDir}. Include each file in the final evidence array as artifact:<filename>. Use flat filenames. Before a long operation, atomically write checkpoint.json there as a JSON array of completed artifact filenames to return if the invocation reaches its deadline. Each file must be at most 8 MiB.`;
  return { outputDir, handoff, checkout: checkout ? cwd : undefined };
}

async function emitArtifacts(outputDir, result, deadline) {
  if (controller.signal.aborted || (!deadline && result.outcome !== "completed")) return true;
  try {
    const files = deadline
      ? readCheckpointFiles(outputDir)
      : readArtifactFiles(outputDir, result.evidence.filter((item) => item.startsWith("artifact:")).map((item) => item.slice(9)));
    for await (const file of files)
      console.log(JSON.stringify({ artifact: { ...file, bytes: file.bytes.toString("base64") } }));
    return true;
  } catch {
    return deadline;
  }
}

async function execute(job) {
  let prepared;
  try { prepared = await prepare(job); }
  catch {
    const invocation = uuid.test(job.admissionId) ? notLaunched(job.admissionId) : undefined;
    return { terminationVerified: true, invocation, diagnosticCode: "checkout_failed", result: { outcome: "failed", summary: "Studio checkout or model failed the pilot admission check." } };
  }
  const { outputDir, handoff } = prepared;
  const { resume, admissionId } = job;
  if (JSON.stringify(job.binding?.workspace) !== JSON.stringify(job.task.source.workspace) ||
      (job.checkout && job.binding?.attemptId !== job.checkout.attemptId))
    return { terminationVerified: true, invocation: notLaunched(admissionId), diagnosticCode: "workspace_policy_mismatch", result: { outcome: "failed" } };
  const outcome = await gatewayWorker(configPath, handoff, resume, admissionId, controller.signal, prepared.checkout, job.binding);
  const invocation = invocationFromWorker(outcome);
  const deadline = outcome.diagnosticCode === "deadline_reached";
  const result = deadline ? { outcome: "failed" } : outcome.result;
  if (outcome.terminationVerified && !await emitArtifacts(outputDir, result, deadline))
    return { terminationVerified: true, invocation, result: { outcome: "failed", summary: "Studio could not read the declared artifacts." } };
  return { terminationVerified: outcome.terminationVerified, sessionId: outcome.sessionId, invocation, result,
    ...(deadline ? { diagnosticCode: outcome.diagnosticCode } : {}) };
}

function admissionEnvelope(value) {
  if (!value || Buffer.byteLength(value) > 512 * 1024) return null;
  try { return JSON.parse(value); }
  catch { return null; }
}

async function recover(job) {
  const prior = await workerResult(job.admissionId);
  const binding = prior.binding?.fleet;
  const sameAttempt = uuid.test(binding?.taskId) && uuid.test(binding?.attemptId)
    && binding.taskId === job.binding?.taskId && binding.attemptId === job.binding?.attemptId
    && JSON.stringify(binding.workspace) === JSON.stringify(job.binding?.workspace);
  if (binding && !sameAttempt) return { terminationVerified: false };
  // The same retained Fleet attempt can request the operator's fresh census.
  // It cannot signal a process or prove a different or still-live admission.
  const observed = sameAttempt && !prior.terminationVerified ? await reconcileWorker(job.admissionId) : prior;
  const proof = { terminationVerified: observed.terminationVerified, admissionId: observed.admissionId,
    invocation: sameAttempt ? invocationFromWorker(observed) : undefined };
  if (proof.invocation?.launch !== "session" || observed.result?.outcome !== "completed" || job.recovery?.source?.project !== project)
    return proof;
  return recoverCompleted(job, observed, proof).catch(() => proof);
}

async function recoverCompleted(job, observed, proof) {
  const { source, checkout } = job.recovery;
  const config = await readWorkerConfig(configPath);
  const { cwd } = await executionCheckout(config, source, checkout);
  if (observed.binding.cwd !== cwd) return proof;
  const emitted = await emitArtifacts(join(cwd, `.factory-artifacts-${job.admissionId}`), observed.result, false);
  return emitted ? { ...proof, result: observed.result } : proof;
}

async function dispatch(value) {
  const job = admissionEnvelope(value);
  if (!job) return { terminationVerified: true, result: { outcome: "failed", summary: "Invalid Studio admission envelope." } };
  if (job.op === "prepare") {
    if (job.source?.project !== project || job.source?.checkout !== "git") return { prepared: false };
    const config = await readWorkerConfig(configPath);
    if (job.source.workspace)
      await checkoutWorkspace(config.cwd, config.fleetWorkspace, job.source.workspace, job.checkout?.attemptId, config.sandbox);
    else {
      if (config.fleetWorkspace) return { prepared: false };
      await studioCheckout(config.cwd, job.checkout, job.source.revision);
    }
    return { prepared: true };
  }
  if (job.op === "recover") return recover(job);
  return execute(job);
}

try {
  const { value } = await lines.next();
  void lines.next().then(() => controller.abort(), () => controller.abort());
  console.log(JSON.stringify({ outcome: await dispatch(value) }));
} catch {
  console.log(JSON.stringify({ outcome: { terminationVerified: false, result: { outcome: "failed", summary: "Studio executor could not prove completion." } } }));
} finally {
  input.close();
  process.stdin.destroy();
}
