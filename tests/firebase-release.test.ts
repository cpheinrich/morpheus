import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";
import { assertSource, deployConfig, digest, expectedIndexKeys, indexKey, selectTarget, verifyRelease } from "../src/firebase-release/verify.js";

const exec = promisify(execFile);
const sha = "a".repeat(40);
const now = Date.parse("2026-09-10T12:00:00Z");
const index = { collectionGroup: "meals", queryScope: "COLLECTION", fields: [
  { fieldPath: "status", order: "ASCENDING" }, { fieldPath: "capturedAt", order: "DESCENDING" },
] };
const liveName = "projects/example-staging/databases/(default)/collectionGroups/meals/indexes/1";
const policy = { version: 1, environments: { staging: { project: "example-staging", indexes: "indexes.json", rules: [
  { release: "cloud.firestore", path: "firestore.rules" },
  { release: "firebase.storage/example-staging.firebasestorage.app", path: "storage.rules" },
] } } };

function fixture() {
  const target = selectTarget(policy, "staging");
  const files: Record<string, string> = { "firestore.rules": "allow write: if validBirthDatePrecision();", "storage.rules": "allow read: if signedIn();", "indexes.json": JSON.stringify({ indexes: [index], fieldOverrides: [] }) };
  const responses = new Map<string, unknown>();
  for (const [i, rule] of target.rules.entries()) {
    const rulesetName = `projects/${target.project}/rulesets/rules${i}`;
    responses.set(`https://firebaserules.googleapis.com/v1/projects/${target.project}/releases/${rule.release}`, { rulesetName, updateTime: "2026-09-10T11:50:00Z" });
    responses.set(`https://firebaserules.googleapis.com/v1/${rulesetName}`, { source: { files: [{ content: files[rule.path] }] } });
  }
  const indexesUrl = `https://firestore.googleapis.com/v1/projects/${target.project}/databases/(default)/collectionGroups/-/indexes`;
  const databaseUrl = `https://firestore.googleapis.com/v1/projects/${target.project}/databases/(default)`;
  responses.set(databaseUrl, { name: `projects/${target.project}/databases/(default)`, type: "FIRESTORE_NATIVE", databaseEdition: "STANDARD" });
  responses.set(indexesUrl, { indexes: [{ ...index, name: liveName, state: "READY" }] });
  const options = { target, environment: "staging", sourceSha: sha, now,
    read: (path: string) => files[path]!, get: async (url: string) => { expect(responses.has(url)).toBe(true); return responses.get(url); } };
  return { options, files, responses, indexesUrl, databaseUrl };
}

describe("Firebase rules and client-readiness contract", () => {
  it("returns credential-free evidence for exact rules and READY indexes", async () => {
    const { options } = fixture();
    const receipt = await verifyRelease(options);
    expect(receipt).toMatchObject({ version: 1, sourceSha: sha, environment: "staging", project: "example-staging", verifiedAt: new Date(now).toISOString(), indexes: [indexKey(index)] });
    expect(JSON.stringify(receipt)).not.toMatch(/Bearer|allow write|allow read|credential/);
    const bytes = `${JSON.stringify(receipt, null, 2)}\n`;
    expect(digest(bytes)).toHaveLength(64);
    expect(digest(bytes)).not.toBe(digest(`${bytes} `));
  });

  it.each(["firestore.rules", "storage.rules"])("blocks the undeployed-source incident for %s", async (path) => {
    const { options, files } = fixture();
    files[path] += "\nnew client prerequisite";
    await expect(verifyRelease(options)).rejects.toThrow("deployed rules differ");
  });

  it.each(["invalid", "2026-09-10T11:50:00.001Z", "2026-09-10T12:01:00Z"])("blocks unpropagated/future/invalid release time %s", async (updateTime) => {
    const { options, responses } = fixture();
    responses.set("https://firebaserules.googleapis.com/v1/projects/example-staging/releases/cloud.firestore", { rulesetName: "projects/example-staging/rulesets/rules0", updateTime });
    await expect(verifyRelease(options)).rejects.toThrow("propagation");
  });

  it("fails closed on missing, denied and cross-project rulesets", async () => {
    const { options, responses } = fixture();
    await expect(verifyRelease({ ...options, get: async () => { throw new Error("HTTP403"); } })).rejects.toThrow("403");
    await expect(verifyRelease({ ...options, get: async () => ({}) })).rejects.toThrow();
    responses.set("https://firebaserules.googleapis.com/v1/projects/example-staging/releases/cloud.firestore", { rulesetName: "projects/other-project/rulesets/rules0" });
    await expect(verifyRelease(options)).rejects.toThrow("cross-project");
  });

  it("follows encoded pagination and recognizes implicit name ordering", async () => {
    const { options, responses, indexesUrl } = fixture();
    responses.set(indexesUrl, { nextPageToken: "page/2" });
    responses.set(`${indexesUrl}?pageToken=page%2F2`, { indexes: [{ name: "projects/example-staging/databases/(default)/collectionGroups/meals/indexes/1", queryScope: "COLLECTION", state: "READY", fields: [...index.fields, { fieldPath: "__name__", order: "DESCENDING" }] }] });
    await expect(verifyRelease(options)).resolves.toBeDefined();
    expect(expectedIndexKeys({ indexes: [{ ...index, apiScope: "ANY_API", density: "SPARSE_ALL", multikey: false, unique: false }] })).toEqual([indexKey(index)]);
    responses.set(`${indexesUrl}?pageToken=page%2F2`, { nextPageToken: "page/2" });
    await expect(verifyRelease(options)).rejects.toThrow("pagination");
  });

  it.each([[], [{ ...index, state: "CREATING" }], [{ ...index, state: "NEEDS_REPAIR" }], [{ ...index, name: liveName, state: "READY", fields: [...index.fields].reverse() }]].map((indexes) => ({ indexes })))("blocks missing, unfinished or incompatible indexes", async ({ indexes }) => {
    const { options, responses, indexesUrl } = fixture();
    responses.set(indexesUrl, { indexes });
    await expect(verifyRelease(options)).rejects.toThrow("not READY");
  });

  it("requires explicit readiness work for field overrides and unsupported index options", () => {
    expect(() => expectedIndexKeys({ indexes: [index], fieldOverrides: [{}] })).toThrow("Field overrides");
    expect(() => expectedIndexKeys({ indexes: [{ ...index, multikey: true }] })).toThrow("Unsupported index");
    expect(() => indexKey({ ...index, fields: [{ fieldPath: "embedding", vectorConfig: { dimension: 8 } }] }, true)).toThrow("Unsupported index");
    expect(() => expectedIndexKeys({ indexes: [], futureIndexes: [{}] })).toThrow("Unsupported index policy");
  });

  it("refuses stale, wrong-checkout, non-main and non-exact sources", () => {
    expect(() => assertSource(sha, sha, sha, "refs/heads/main")).not.toThrow();
    expect(() => assertSource(sha, "b".repeat(40), sha, "refs/heads/main")).toThrow("Superseded");
    expect(() => assertSource(sha, sha, "b".repeat(40), "refs/heads/main")).toThrow("Checkout");
    expect(() => assertSource(sha, sha, sha, "refs/pull/1/merge")).toThrow("main");
    expect(() => assertSource("main", "main", "main", "refs/heads/main")).toThrow("exact");
  });

  it("keeps project selection local and emits only explicitly targeted rule deploys", () => {
    const target = selectTarget(policy, "staging");
    const result = deployConfig(target, { "firestore.rules": "/tmp/rules0", "storage.rules": "/tmp/rules1" });
    expect(result).toEqual({ only: "firestore:rules,storage", config: { firestore: { database: "(default)", rules: "/tmp/rules0" }, storage: [{ bucket: "example-staging.firebasestorage.app", rules: "/tmp/rules1" }] } });
    expect(deployConfig({ ...target, rules: [target.rules[0]!] }, { "firestore.rules": "/tmp/rules0" }).only).toBe("firestore:rules");
    expect(JSON.stringify(result)).not.toMatch(/indexes|functions|hosting|auth|predeploy/);
    expect(() => selectTarget(policy, "production")).toThrow("Unknown");
    expect(() => selectTarget({ version: 1, environments: { staging: { ...target, indexes: "../secret" } } }, "staging")).toThrow("traversal");
    expect(() => selectTarget({ version: 1, environments: { staging: { ...target, database: "other" } } }, "staging")).toThrow("Unsupported release target");
  });

  it("rejects READY indexes with a missing or cross-project identity", async () => {
    for (const name of [undefined, liveName.replace("example-staging", "other-project")]) {
      const { options, responses, indexesUrl } = fixture();
      responses.set(indexesUrl, { indexes: [{ ...index, state: "READY", name }] });
      await expect(verifyRelease(options)).rejects.toThrow("index identity");
    }
  });

  it.each([{ apiScope: "DATASTORE_MODE_API" }, { apiScope: "MONGODB_COMPATIBLE_API" }, { density: "SPARSE_ANY" }, { density: "DENSE" }, { multikey: true }, { unique: true }, { futureIndexOption: "unsupported" }])("does not issue a receipt for unsupported live index semantics %j", async (variant) => {
    const { options, responses, indexesUrl } = fixture();
    responses.set(indexesUrl, { indexes: [{ ...index, name: liveName, state: "READY", ...variant }] });
    await expect(verifyRelease(options)).rejects.toThrow("not READY");
  });

  it("normalizes supported omitted and explicit native Standard index defaults", async () => {
    const { options, responses, indexesUrl, databaseUrl } = fixture();
    responses.set(databaseUrl, { name: "projects/example-staging/databases/(default)", type: "FIRESTORE_NATIVE" });
    responses.set(indexesUrl, { indexes: [{ ...index, name: liveName, state: "READY", apiScope: "ANY_API", density: "SPARSE_ALL", multikey: false, unique: false }] });
    await expect(verifyRelease(options)).resolves.toBeDefined();
  });

  it.each([{ databaseEdition: "ENTERPRISE" }, { type: "DATASTORE_MODE" }, { name: "projects/other-project/databases/(default)" }])("rejects an unsupported database identity or edition %j", async (variant) => {
    const { options, responses, databaseUrl } = fixture();
    responses.set(databaseUrl, { name: "projects/example-staging/databases/(default)", type: "FIRESTORE_NATIVE", databaseEdition: "STANDARD", ...variant });
    await expect(verifyRelease(options)).rejects.toThrow("database");
  });
});

it("executes the real action preflight against immutable git blobs and a fake main API", async () => {
  const root = await mkdtemp(join(tmpdir(), "firebase-release-test-"));
  const runPath = join(import.meta.dirname, "../src/firebase-release/run.ts");
  let currentMain = "";
  const mainSequence: string[] = [];
  const server = createServer((_request, response) => { response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify({ object: { sha: mainSequence.shift() ?? currentMain } })); });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No test address");
    const git = (...args: string[]) => exec("git", args, { cwd: root });
    await git("init", "-q");
    await git("config", "user.name", "Fixture"); await git("config", "user.email", "fixture@example.test");
    const { files } = fixture();
    await Promise.all(Object.entries({ ...files, "release.json": JSON.stringify(policy) }).map(([path, bytes]) => writeFile(join(root, path), bytes)));
    await git("add", "."); await git("commit", "-qm", "tested source");
    currentMain = (await git("rev-parse", "HEAD")).stdout.trim();
    const output = join(root, "outputs");
    const env = { ...process.env, GITHUB_API_URL: `http://127.0.0.1:${address.port}`, GITHUB_REPOSITORY: "sample/project", GH_TOKEN: "test-only", GITHUB_REF: "refs/heads/main", GITHUB_EVENT_NAME: "push", GITHUB_OUTPUT: output, RUNNER_TEMP: root,
      FIREBASE_SOURCE_SHA: currentMain, FIREBASE_OPERATION: "deploy", FIREBASE_TESTS_RESULT: "success", FIREBASE_POLICY_FILE: "release.json", FIREBASE_ENVIRONMENT: "staging", FIREBASE_CLI_VERSION: "15.29.0" };
    const invoke = (command: string, patch: Record<string, string> = {}, imports: string[] = []) => exec(process.execPath,
      ["--import", join(import.meta.dirname, "../node_modules/tsx/dist/loader.mjs"), ...imports.flatMap((path) => ["--import", path]), runPath, command],
      { cwd: root, env: { ...env, ...patch } });
    const run = (patch: Record<string, string> = {}) => invoke("prepare", patch);
    await writeFile(join(root, "firestore.rules"), "UNTESTED WORKING COPY");
    await run();
    const planPath = (await readFile(output, "utf8")).split("\n").find((line) => line.startsWith("plan="))!.slice(5);
    const plan = JSON.parse(await readFile(planPath, "utf8"));
    expect(plan.files["firestore.rules"]).toBe(files["firestore.rules"]);
    expect(await readFile(join(plan.directory, "rules-0.rules"), "utf8")).toBe(files["firestore.rules"]);
    expect(plan.only).toBe("firestore:rules,storage");
    const bin = join(root, "bin");
    await mkdir(bin);
    const fakeCli = join(bin, "firebase");
    const capture = join(root, "deploy-call.json");
    await writeFile(fakeCli, '#!/usr/bin/env node\nconst fs=require("node:fs");const configHome=process.env.XDG_CONFIG_HOME;const configPath=require("node:path").join(configHome,"configstore/firebase-tools.json");fs.writeFileSync(process.env.DEPLOY_CAPTURE,JSON.stringify({args:process.argv.slice(2),legacyTokenPresent:!!process.env.FIREBASE_TOKEN,credentialsFile:process.env.GOOGLE_APPLICATION_CREDENTIALS,configHome,cachedUser:fs.existsSync(configPath)?JSON.parse(fs.readFileSync(configPath,"utf8")).user:null}));\n');
    await chmod(fakeCli, 0o755);
    const inheritedConfig = join(root, "inherited-config");
    await mkdir(join(inheritedConfig, "configstore"), { recursive: true });
    const inheritedLogin = join(inheritedConfig, "configstore/firebase-tools.json");
    const cachedLogin = JSON.stringify({ user: { email: "cached@example.invalid" }, tokens: { refresh_token: "synthetic-token" } });
    await writeFile(inheritedLogin, cachedLogin);
    const deployEnv = { FIREBASE_PLAN: planPath, GOOGLE_APPLICATION_CREDENTIALS: join(root, "synthetic-credentials.json"), FIREBASE_TOKEN: "must-not-be-used", XDG_CONFIG_HOME: inheritedConfig, PATH: `${bin}:${process.env.PATH}`, DEPLOY_CAPTURE: capture };
    await invoke("deploy", deployEnv);
    const deployment = JSON.parse(await readFile(capture, "utf8"));
    expect(deployment).toEqual({ args: ["deploy", "--project", "example-staging", "--config", join(plan.directory, "firebase.json"), "--only", "firestore:rules,storage", "--non-interactive"], legacyTokenPresent: false, credentialsFile: deployEnv.GOOGLE_APPLICATION_CREDENTIALS, configHome: expect.stringMatching(new RegExp(`^${plan.directory}/firebase-config-`)), cachedUser: null });
    expect(await readdir(deployment.configHome)).toEqual([]);
    // A retry also gets a fresh store even if the preceding CLI invocation saved a login.
    await mkdir(join(deployment.configHome, "configstore"));
    await writeFile(join(deployment.configHome, "configstore/firebase-tools.json"), cachedLogin);
    await invoke("deploy", deployEnv);
    const retry = JSON.parse(await readFile(capture, "utf8"));
    expect(retry.cachedUser).toBeNull();
    expect(retry.configHome).not.toBe(deployment.configHome);
    expect(retry.credentialsFile).toBe(deployEnv.GOOGLE_APPLICATION_CREDENTIALS);
    expect(await readFile(inheritedLogin, "utf8")).toBe(cachedLogin);

    // Intercept only Google endpoints in this child. GitHub source checks still use the real local server.
    const mockApi = join(root, "fake-google.mjs");
    const responses = Object.fromEntries(fixture().responses);
    await writeFile(mockApi, `const responses = ${JSON.stringify(responses)}; const realFetch=globalThis.fetch; globalThis.fetch=async(url,options)=>{if(String(url).includes(".googleapis.com/")){if(!Object.hasOwn(responses,url))throw Error("Unexpected Google URL");if(options.headers.Authorization!=="Bearer test-verifier")throw Error("Wrong verifier token");return new Response(JSON.stringify(responses[url]),{status:200});}return realFetch(url,options);};\n`);
    const verifyEnv = { FIREBASE_PLAN: planPath, FIREBASE_ACCESS_TOKEN: "test-verifier" };
    await invoke("verify", verifyEnv, [mockApi]);
    const outputs = await readFile(output, "utf8");
    const receiptPath = outputs.split("\n").find((line) => line.startsWith("receipt="))!.slice(8);
    const receiptBytes = await readFile(receiptPath, "utf8");
    expect(receiptPath).toBe(join(plan.directory, `firebase-release-${digest(receiptBytes)}.json`));
    expect(outputs).toContain(`sha256=${digest(receiptBytes)}\n`);
    expect(receiptBytes).not.toContain("test-verifier");
    expect(JSON.parse(receiptBytes).sourceSha).toBe(currentMain);
    mainSequence.push(currentMain, "b".repeat(40));
    await expect(invoke("verify", verifyEnv, [mockApi])).rejects.toMatchObject({ stderr: expect.stringContaining("Superseded") });
    expect((await readdir(plan.directory)).filter((path) => path.startsWith("firebase-release-"))).toHaveLength(1);
    expect(await readFile(output, "utf8")).toBe(outputs);
    await expect(run({ FIREBASE_TESTS_RESULT: "failure" })).rejects.toMatchObject({ stderr: expect.stringContaining("successful tests") });
    await expect(run({ FIREBASE_CLI_VERSION: "latest" })).rejects.toMatchObject({ stderr: expect.stringContaining("exact Firebase CLI") });
    await expect(run({ GITHUB_EVENT_NAME: "pull_request" })).rejects.toMatchObject({ stderr: expect.stringContaining("Unsupported deployment event") });
    const eventPath = join(root, "event.json");
    const completedRun = { conclusion: "success", event: "push", head_branch: "main", head_sha: currentMain, head_repository: { full_name: "sample/project" } };
    const workflowEvent = { GITHUB_EVENT_NAME: "workflow_run", GITHUB_EVENT_PATH: eventPath };
    await writeFile(eventPath, JSON.stringify({ workflow_run: completedRun }));
    await run(workflowEvent);
    for (const patch of [{ conclusion: "failure" }, { event: "pull_request" }, { head_branch: "feature" }, { head_sha: "b".repeat(40) }, { head_repository: { full_name: "fork/project" } }]) {
      await writeFile(eventPath, JSON.stringify({ workflow_run: { ...completedRun, ...patch } }));
      await expect(run(workflowEvent)).rejects.toMatchObject({ stderr: expect.stringContaining("same-repository main push tests") });
    }
    currentMain = "b".repeat(40);
    await expect(run()).rejects.toMatchObject({ stderr: expect.stringContaining("Superseded") });
    await rm(capture);
    await expect(invoke("deploy", deployEnv)).rejects.toMatchObject({ stderr: expect.stringContaining("Superseded") });
    await expect(readFile(capture)).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(root, { recursive: true, force: true });
  }
});

it("runs auth in the caller job after preflight/tooling and retains only verified receipts", async () => {
  const action = load(await readFile(join(import.meta.dirname, "../.github/actions/firebase-release/action.yml"), "utf8")) as { runs: { using: string; steps: { name?: string; uses?: string; if?: string; with?: Record<string, unknown> }[] } };
  expect(action.runs.using).toBe("composite");
  const steps = action.runs.steps;
  const position = (name: string) => steps.findIndex((step) => step.name === name);
  expect(position("Validate tested main source and caller policy")).toBeLessThan(position("Install scoped deployment tool"));
  expect(position("Install scoped deployment tool")).toBeLessThan(position("Authenticate rules deployer"));
  expect(position("Deploy only declared rules")).toBeLessThan(position("Read live rules and READY indexes"));
  for (const step of steps.filter((step) => step.uses)) expect(step.uses).toMatch(/@[a-f0-9]{40}$/);
  const verifier = steps.find((step) => step.name === "Authenticate read-only verifier")!;
  expect(verifier.with?.create_credentials_file).toBe(false);
  expect(verifier.with?.export_environment_variables).toBe(false);
  expect(steps.at(-1)?.with?.path).toBe("${{ steps.verify.outputs.receipt }}");
  expect(steps.at(-1)?.with?.["if-no-files-found"]).toBe("error");
});

it("keeps backend writes and complete client publication in one caller-owned lock", async () => {
  const read = async (file: string) => load(await readFile(join(import.meta.dirname, "../docs/examples/firebase-release", file), "utf8")) as { permissions: Record<string, string>; concurrency: Record<string, unknown>; jobs: Record<string, { uses?: string; if?: string; environment?: string; needs?: string | string[]; steps?: { name?: string; uses?: string; with?: Record<string, unknown>; run?: string }[] }> };
  const backend = await read("backend.yml");
  const client = await read("client.yml");
  expect(backend.concurrency).toEqual({ group: "firebase-client-release", "cancel-in-progress": false });
  expect(client.concurrency).toEqual(backend.concurrency);
  expect(backend.permissions["pull-requests"]).toBe("read");
  expect(backend.jobs.source?.uses).toBe("cpheinrich/morpheus/.github/workflows/release-preflight.yml@main");
  expect(backend.jobs.deploy?.needs).toEqual(["source", "tests"]);
  expect(backend.jobs.deploy?.steps?.[0]?.with?.ref).toBe("${{ needs.source.outputs.sha }}");
  expect(backend.jobs.tests?.needs).toBe("source");
  expect(backend.jobs.tests?.steps?.[0]?.with?.ref).toBe("${{ needs.source.outputs.sha }}");
  expect(backend.jobs.deploy?.if).toContain("needs.tests.result == 'success'");
  expect(backend.jobs.deploy?.if).toContain("head_repository.full_name == github.repository");
  expect(backend.jobs.deploy?.environment).toBe("firebase-${{ inputs.environment || 'staging' }}");
  expect(client.jobs.publish?.environment).toBe("client-staging");
  const publish = client.jobs.publish?.steps ?? [];
  const verify = publish.findIndex((step) => step.uses?.includes("firebase-release@"));
  expect(verify).toBeGreaterThan(-1);
  expect(publish.findIndex((step) => step.run === "pnpm run release:client")).toBeGreaterThan(verify);
});

it("evaluates backend event gates so explicit cancellation and failed provenance cannot deploy", async () => {
  const workflow = load(await readFile(join(import.meta.dirname, "../docs/examples/firebase-release/backend.yml"), "utf8")) as { jobs: { deploy: { if: string; steps: { name?: string; run?: string; uses?: string; env?: Record<string, string>; with?: Record<string, string> }[] }; tests: { steps: { name?: string; run?: string }[] } } };
  const evaluate = new Function("github", "needs", "cancelled", "always", `return (${workflow.jobs.deploy.if});`);
  const run = { conclusion: "success", event: "push", head_branch: "main", head_repository: { full_name: "sample/project" } };
  const github = { ref: "refs/heads/main", repository: "sample/project", event_name: "workflow_run", event: { workflow_run: run } };
  const needs = { source: { result: "success" }, tests: { result: "skipped" } };
  expect(evaluate(github, needs, () => false, () => true)).toBe(true);
  expect(evaluate(github, needs, () => true, () => true)).toBe(false);
  expect(evaluate(github, { ...needs, source: { result: "failure" } }, () => false, () => true)).toBe(false);
  expect(evaluate({ ...github, event_name: "workflow_dispatch" }, { ...needs, tests: { result: "success" } }, () => false, () => true)).toBe(true);
  expect(evaluate({ ...github, event_name: "workflow_dispatch" }, needs, () => false, () => true)).toBe(false);
  const bind = workflow.jobs.tests.steps.find((step) => step.name === "Bind manual test source to release preflight")?.run;
  expect(bind).toBeDefined();
  await expect(exec("bash", ["-euo", "pipefail", "-c", bind!], { env: { ...process.env, REQUESTED_SHA: sha, VERIFIED_SHA: sha } })).resolves.toBeDefined();
  await expect(exec("bash", ["-euo", "pipefail", "-c", bind!], { env: { ...process.env, REQUESTED_SHA: sha, VERIFIED_SHA: "b".repeat(40) } })).rejects.toBeDefined();
  const deploymentBind = workflow.jobs.deploy.steps.find((step) => step.name === "Bind successful test source to release preflight")!;
  expect(deploymentBind.env?.REQUESTED_SHA).toBe("${{ github.event.workflow_run.head_sha || inputs.source-sha }}");
  expect(deploymentBind.env?.VERIFIED_SHA).toBe("${{ needs.source.outputs.sha }}");
  await expect(exec("bash", ["-euo", "pipefail", "-c", deploymentBind.run!], { env: { ...process.env, REQUESTED_SHA: sha, VERIFIED_SHA: sha } })).resolves.toBeDefined();
  await expect(exec("bash", ["-euo", "pipefail", "-c", deploymentBind.run!], { env: { ...process.env, REQUESTED_SHA: "b".repeat(40), VERIFIED_SHA: sha } })).rejects.toBeDefined();
  expect(workflow.jobs.deploy.steps.find((step) => step.uses?.includes("firebase-release@"))?.with?.["source-sha"]).toBe("${{ needs.source.outputs.sha }}");
});
