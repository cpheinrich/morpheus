// Runs as the unprivileged execution account. The fixed argv paths are
// installed by the host operator; the supervisor supplies one JSON line.
import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { gatewayWorker, readWorkerConfig, workerResult } from "../src/gateway-worker.mjs";
import { readArtifactFiles } from "../src/fleet-artifacts.mjs";

const [configPath, project] = process.argv.slice(2);
const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
const controller = new AbortController();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const lines = input[Symbol.asyncIterator]();

async function prepare({ task, admissionId, resume, prompt, gatewayBaseUrl }) {
  const config = await readWorkerConfig(configPath);
  const git = (...args) => execFileSync("git", ["-C", config.cwd, ...args], { encoding: "utf8", timeout: 5000 }).trim();
  if (task.source.project !== project || task.source.revision !== git("rev-parse", "HEAD") ||
      task.selection.provider !== "codex" || task.selection.model !== config.model ||
      task.selection.gateway !== config.gateway.name || gatewayBaseUrl?.replace(/\/+$/, "") !== config.gateway.baseUrl ||
      config.sandbox !== "workspace-write" || !uuid.test(admissionId))
    throw new Error("Studio checkout or gateway model does not match this enrollment");
  if (!resume && git("status", "--porcelain")) throw new Error("Studio pilot checkout is dirty");
  // Each invocation gets a fresh folder. On resume the worker can copy files
  // from its previous invocation if needed, but only this folder is published.
  const outputDir = join(config.cwd, `.factory-artifacts-${admissionId}`);
  await mkdir(outputDir, { mode: 0o700 });
  const handoff = `${prompt}\n\nFor output artifacts, write files directly in ${outputDir}. Include each file in the final evidence array as artifact:<filename>. Use flat filenames.`;
  return { outputDir, handoff };
}

async function execute(job) {
  let prepared;
  try { prepared = await prepare(job); }
  catch {
    return { terminationVerified: true, result: { outcome: "failed", summary: "Studio checkout or model failed the pilot admission check." } };
  }
  const { outputDir, handoff } = prepared;
  const { resume, admissionId } = job;
  const outcome = await gatewayWorker(configPath, handoff, resume, admissionId, controller.signal);
  if (outcome.terminationVerified && outcome.result.outcome === "completed" && !controller.signal.aborted) {
    const files = outcome.result.evidence.filter((item) => item.startsWith("artifact:")).map((item) => item.slice(9));
    try {
      for await (const file of readArtifactFiles(outputDir, files))
        console.log(JSON.stringify({ artifact: { ...file, bytes: file.bytes.toString("base64") } }));
    } catch {
      return { terminationVerified: true, result: { outcome: "failed", summary: "Studio could not read the declared artifacts." } };
    }
  }
  return { terminationVerified: outcome.terminationVerified, sessionId: outcome.sessionId, result: outcome.result };
}

function admissionEnvelope(value) {
  if (!value || Buffer.byteLength(value) > 512 * 1024) return null;
  try { return JSON.parse(value); }
  catch { return null; }
}

async function dispatch(value) {
  const job = admissionEnvelope(value);
  if (!job) return { terminationVerified: true, result: { outcome: "failed", summary: "Invalid Studio admission envelope." } };
  if (job.op === "recover") {
    const prior = await workerResult(job.admissionId);
    return { terminationVerified: prior.terminationVerified, admissionId: prior.admissionId };
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
