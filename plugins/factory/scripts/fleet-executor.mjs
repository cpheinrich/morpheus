// Runs as the unprivileged execution account. The fixed argv paths are
// installed by the host operator; the supervisor supplies one JSON line.
import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { gatewayWorker, readWorkerConfig, workerResult } from "../src/gateway-worker.mjs";
import { readArtifactFiles } from "../src/fleet-artifacts.mjs";
import { studioCheckout } from "../src/fleet-source.mjs";
import { invocationFromWorker, notLaunched } from "../src/fleet-receipt.mjs";

const [configPath, project] = process.argv.slice(2);
const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
const controller = new AbortController();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const lines = input[Symbol.asyncIterator]();

async function prepare({ task, admissionId, resume, prompt, gatewayBaseUrl, checkout }) {
  const config = await readWorkerConfig(configPath);
  if (task.source.project !== project || task.selection.provider !== "codex" ||
      task.selection.model !== config.model || task.selection.gateway !== config.gateway.name ||
      gatewayBaseUrl?.replace(/\/+$/, "") !== config.gateway.baseUrl ||
      config.sandbox !== "workspace-write" || !uuid.test(admissionId))
    throw new Error("Studio project or gateway model does not match this enrollment");
  const cwd = task.source.checkout === "git"
    ? await studioCheckout(config.cwd, checkout, task.source.revision, true)
    : config.cwd;
  const git = (...args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", timeout: 5000 }).trim();
  if (task.source.revision !== git("rev-parse", "HEAD") || (!resume && git("status", "--porcelain")))
    throw new Error("Studio checkout does not match this admission");
  const outputDir = join(cwd, `.factory-artifacts-${admissionId}`);
  await mkdir(outputDir, { mode: 0o700 });
  const handoff = `${prompt}\n\nFor output artifacts, write files directly in ${outputDir}. Include each file in the final evidence array as artifact:<filename>. Use flat filenames.`;
  return { outputDir, handoff, checkout: checkout ? cwd : undefined };
}

async function execute(job) {
  let prepared;
  try { prepared = await prepare(job); }
  catch {
    const invocation = uuid.test(job.admissionId) ? notLaunched(job.admissionId) : undefined;
    return { terminationVerified: true, invocation, result: { outcome: "failed", summary: "Studio checkout or model failed the pilot admission check." } };
  }
  const { outputDir, handoff } = prepared;
  const { resume, admissionId } = job;
  const outcome = await gatewayWorker(configPath, handoff, resume, admissionId, controller.signal, prepared.checkout, job.binding);
  const invocation = invocationFromWorker(outcome);
  if (outcome.terminationVerified && outcome.result.outcome === "completed" && !controller.signal.aborted) {
    const files = outcome.result.evidence.filter((item) => item.startsWith("artifact:")).map((item) => item.slice(9));
    try {
      for await (const file of readArtifactFiles(outputDir, files))
        console.log(JSON.stringify({ artifact: { ...file, bytes: file.bytes.toString("base64") } }));
    } catch {
      return { terminationVerified: true, invocation, result: { outcome: "failed", summary: "Studio could not read the declared artifacts." } };
    }
  }
  return { terminationVerified: outcome.terminationVerified, sessionId: outcome.sessionId, invocation, result: outcome.result };
}

function admissionEnvelope(value) {
  if (!value || Buffer.byteLength(value) > 512 * 1024) return null;
  try { return JSON.parse(value); }
  catch { return null; }
}

async function dispatch(value) {
  const job = admissionEnvelope(value);
  if (!job) return { terminationVerified: true, result: { outcome: "failed", summary: "Invalid Studio admission envelope." } };
  if (job.op === "prepare") {
    if (job.source?.project !== project || job.source?.checkout !== "git") return { prepared: false };
    const { cwd } = await readWorkerConfig(configPath);
    await studioCheckout(cwd, job.checkout, job.source.revision);
    return { prepared: true };
  }
  if (job.op === "recover") {
    const prior = await workerResult(job.admissionId);
    const binding = prior.binding?.fleet;
    const sameAttempt = binding?.taskId === job.binding?.taskId && binding?.attemptId === job.binding?.attemptId;
    if (binding && !sameAttempt) return { terminationVerified: false };
    return { terminationVerified: prior.terminationVerified, admissionId: prior.admissionId,
      invocation: binding && sameAttempt ? invocationFromWorker(prior) : undefined };
  }
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
