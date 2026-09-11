import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { assertSource, deployConfig, digest, expectedIndexKeys, selectTarget, verifyRelease, type ReleaseTarget } from "./verify.js";

interface Plan {
  sourceSha: string;
  environment: string;
  operation: string;
  target: ReleaseTarget;
  files: Record<string, string>;
  directory: string;
  only: string;
}

const git = (...args: string[]): string => execFileSync("git", args, { encoding: "utf8" }).trim();
const required = (name: string): string => { const value = process.env[name]; assert(value, `${name} is required`); return value; };
const output = (name: string, value: string): void => {
  assert(!/[\r\n]/.test(value), "Invalid action output");
  writeFileSync(required("GITHUB_OUTPUT"), `${name}=${value}\n`, { flag: "a" });
};

async function jsonGet(url: string, token: string, project?: string): Promise<unknown> {
  const response = await fetch(url, { headers: {
    Authorization: `Bearer ${token}`,
    ...(project ? { "x-goog-user-project": project } : { Accept: "application/vnd.github+json" }),
  }, redirect: "error", signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Release verification HTTP ${response.status}`);
  return response.json();
}

async function currentSource(sourceSha: string): Promise<void> {
  const repo = required("GITHUB_REPOSITORY");
  assert(/^[\w.-]+\/[\w.-]+$/.test(repo), "Invalid GitHub repository");
  const base = process.env.GITHUB_API_URL ?? "https://api.github.com";
  const main = await jsonGet(`${base}/repos/${repo}/git/ref/heads/main`, required("GH_TOKEN")) as { object?: { sha?: string } };
  assertSource(sourceSha, main.object?.sha ?? "", git("rev-parse", "HEAD"), required("GITHUB_REF"));
}

function readTracked(sourceSha: string, path: string): string {
  assert(/^[A-Za-z0-9_./-]+$/.test(path) && !path.startsWith("/")
    && path.split("/").every((part) => part && part !== "." && part !== ".."), "Invalid tracked source path");
  // Read immutable tested blobs, never a generated or locally edited working-tree file.
  return execFileSync("git", ["show", `${sourceSha}:${path}`], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
}

async function prepare(): Promise<void> {
  const sourceSha = required("FIREBASE_SOURCE_SHA");
  await currentSource(sourceSha);
  const operation = required("FIREBASE_OPERATION");
  assert(["verify", "deploy"].includes(operation), "Operation must be verify or deploy");
  if (operation === "deploy") {
    assert.equal(process.env.FIREBASE_TESTS_RESULT, "success", "Deployment requires successful tests for source-sha");
    assert(["push", "workflow_run", "workflow_dispatch"].includes(required("GITHUB_EVENT_NAME")), "Unsupported deployment event");
    if (process.env.GITHUB_EVENT_NAME === "workflow_run") {
      const event = JSON.parse(readFileSync(required("GITHUB_EVENT_PATH"), "utf8"));
      const run = event.workflow_run;
      assert(run?.conclusion === "success" && run.event === "push" && run.head_branch === "main"
        && run.head_sha === sourceSha && run.head_repository?.full_name === process.env.GITHUB_REPOSITORY,
      "Deployment requires successful same-repository main push tests at source-sha");
    }
  }
  assert(/^\d+\.\d+\.\d+$/.test(required("FIREBASE_CLI_VERSION")), "Pin an exact Firebase CLI version");
  const environment = required("FIREBASE_ENVIRONMENT");
  const target = selectTarget(JSON.parse(readTracked(sourceSha, required("FIREBASE_POLICY_FILE"))), environment);
  const files = Object.fromEntries([...target.rules.map((rule) => rule.path), target.indexes]
    .map((path) => [path, readTracked(sourceSha, path)]));
  expectedIndexKeys(JSON.parse(files[target.indexes]!));
  const directory = mkdtempSync(join(required("RUNNER_TEMP"), "morpheus-firebase-"));
  const sourceFiles = Object.fromEntries(target.rules.map((rule, i) => {
    const path = join(directory, `rules-${i}.rules`);
    writeFileSync(path, files[rule.path]!, { mode: 0o600 });
    return [rule.path, path];
  }));
  const { config, only } = deployConfig(target, sourceFiles);
  writeFileSync(join(directory, "firebase.json"), JSON.stringify(config), { mode: 0o600 });
  const plan: Plan = { sourceSha, environment, operation, target, files, directory, only };
  const planPath = join(directory, "plan.json");
  writeFileSync(planPath, JSON.stringify(plan), { mode: 0o600 });
  output("plan", planPath);
  output("project", target.project);
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === "prepare") { await prepare(); return; }
  assert(command === "deploy" || command === "verify", "Expected prepare, deploy or verify");
  const plan: Plan = JSON.parse(readFileSync(required("FIREBASE_PLAN"), "utf8"));
  await currentSource(plan.sourceSha);
  if (command === "deploy") {
    assert.equal(plan.operation, "deploy", "This plan does not authorize deployment");
    required("GOOGLE_APPLICATION_CREDENTIALS");
    const env = { ...process.env };
    delete env.FIREBASE_TOKEN;
    execFileSync("firebase", ["deploy", "--project", plan.target.project, "--config", join(plan.directory, "firebase.json"),
      "--only", plan.only, "--non-interactive"], { cwd: plan.directory, env, stdio: "inherit" });
    return;
  }
  const token = required("FIREBASE_ACCESS_TOKEN");
  const receipt = await verifyRelease({ target: plan.target, environment: plan.environment, sourceSha: plan.sourceSha,
    read: (path) => { assert(Object.hasOwn(plan.files, path), "Source is absent from tested plan"); return plan.files[path]!; },
    get: (url) => jsonGet(url, token, plan.target.project) });
  await currentSource(plan.sourceSha);
  const bytes = `${JSON.stringify(receipt, null, 2)}\n`;
  const sha256 = digest(bytes);
  const path = join(plan.directory, `firebase-release-${sha256}.json`);
  writeFileSync(path, bytes, { mode: 0o600, flag: "wx" });
  output("receipt", path);
  output("sha256", sha256);
  console.log(`Verified ${plan.target.project} rules and READY indexes for ${plan.sourceSha}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Firebase release failed"); process.exitCode = 1; });
}
