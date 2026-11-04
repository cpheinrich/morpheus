import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { configRead, configWrite } from "../src/store.mjs";
import { activation, configSchema, defaults, release, route } from "../src/config.mjs";
import { settingsMigration } from "../scripts/install-lib.mjs";

const task = { project: "/repo/.git", override: "auto" };
const gateway = { name: "claude", provider: "claude", baseUrl: "http://gw", keyRef: "env:KEY", usedPercent: 5 };

async function freshHome(t) {
  const directory = await mkdtemp(join(tmpdir(), "factory-release-"));
  const previous = process.env.FACTORY_HOME;
  process.env.FACTORY_HOME = directory;
  t.after(async () => {
    if (previous === undefined) delete process.env.FACTORY_HOME;
    else process.env.FACTORY_HOME = previous;
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

// Runs a plugin script as a hook or the CLI would. FACTORY_DELEGATED is removed: a delegated
// session sets it, and with it every hook exits before reading the mode, so these tests would
// pass without exercising the mode check at all.
function run(script, args, { home, stdin = "" }) {
  const env = { ...process.env, FACTORY_HOME: home };
  delete env.FACTORY_DELEGATED;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [new URL(`../scripts/${script}`, import.meta.url).pathname, ...args], { env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (b) => (stdout += b));
    child.stderr.on("data", (b) => (stderr += b));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(stdin);
  });
}

test("the repository marks Factory experimental and off by default", () => {
  assert.deepEqual(release, { status: "experimental", defaultMode: "off" });
  assert.ok(Object.isFrozen(release));
  assert.equal(defaults().mode, "off");
  // A saved document without a mode, such as settings carried from an old install that never
  // chose one, also stays off.
  assert.equal(configSchema.parse({ threshold: 50 }).mode, "off");
  assert.deepEqual(activation(defaults()), { status: "experimental", mode: "off", enabled: false });
});

test("a fresh machine is disabled, and reading its settings writes nothing", async (t) => {
  const home = await freshHome(t);
  const config = await configRead();
  assert.equal(activation(config).enabled, false);
  assert.deepEqual(route(config, task, [gateway]), { executor: "codex", reason: "Delegation disabled" });
  assert.deepEqual(await readdir(home), []);
});

test("only this machine's saved mode turns Factory on, and off turns it back off", async (t) => {
  await freshHome(t);
  await configWrite({ ...defaults(), mode: "automatic" });
  const on = await configRead();
  assert.deepEqual(activation(on), { status: "experimental", mode: "automatic", enabled: true });
  assert.equal(route(on, task, [gateway]).gateway.name, "claude");
  await configWrite({ ...on, mode: "manual" });
  assert.equal(activation(await configRead()).enabled, true);
  await configWrite({ ...on, mode: "off" });
  const off = await configRead();
  assert.equal(activation(off).enabled, false);
  assert.equal(route(off, task, [gateway], "claude").reason, "Delegation disabled");
  // A project opting in cannot enable a machine that is globally off.
  const project = { ...off, projects: { [task.project]: "automatic" } };
  assert.equal(activation(project).enabled, false);
  assert.equal(route(project, task, [gateway]).reason, "Delegation disabled");
});

test("an install or update never replaces a saved choice and never enrols a machine", () => {
  // No old install: nothing is written, so a first install stays at the default off.
  assert.deepEqual(settingsMigration(false, null), { skip: "no old config.json" });
  // A saved factory config is the machine's own choice, in either direction.
  for (const legacy of [{ mode: "automatic" }, { mode: "off" }])
    assert.match(settingsMigration(true, legacy).skip, /left alone/);
  // An old install's explicit choice carries over as that choice, and only that.
  assert.equal(settingsMigration(false, { mode: "automatic" }).config.mode, "automatic");
  assert.equal(settingsMigration(false, { mode: "off" }).config.mode, "off");
  const unchosen = settingsMigration(false, { maxConcurrent: 3 }).config;
  assert.equal("mode" in unchosen, false);
  assert.equal(configSchema.parse(unchosen).mode, "off");
});

test("hooks on a fresh or disabled machine print nothing and start no service", async (t) => {
  const home = await freshHome(t);
  const input = (event) =>
    JSON.stringify({ session_id: "thread-1", hook_event_name: event, cwd: home, permission_mode: "default" });
  const runAll = async () => {
    for (const script of ["hook.mjs", "claude-hook.mjs"])
      for (const event of ["SessionStart", "UserPromptSubmit"]) {
        const result = await run(script, [event], { home, stdin: input(event) });
        assert.deepEqual(result, { code: 0, stdout: "", stderr: "" }, `${script} ${event}`);
      }
  };
  await runAll();
  assert.deepEqual(await readdir(home), []);
  await configWrite({ ...defaults(), mode: "off" });
  await runAll();
  assert.deepEqual((await readdir(home)).sort(), ["config.json", "runs"]);
});

test("enable requires an explicit mode and changes nothing otherwise", async (t) => {
  const home = await freshHome(t);
  for (const args of [["enable"], ["enable", "on"]]) {
    const result = await run("bridge.mjs", args, { home });
    assert.equal(result.code, 1, args.join(" "));
    assert.match(result.stderr, /Use enable manual or enable automatic/);
  }
  assert.deepEqual(await readdir(home), []);
  await configWrite({ ...defaults(), mode: "manual" });
  await run("bridge.mjs", ["enable"], { home });
  assert.equal(JSON.parse(await readFile(join(home, "config.json"), "utf8")).mode, "manual");
});


test("Factory CLI no longer advertises or accepts remote pool commands", async (t) => {
  const home = await freshHome(t);
  const help = await run("bridge.mjs", ["help"], { home });
  assert.equal(help.code, 0);
  assert.doesNotMatch(help.stdout, /pool[.-]|Paperclip/i);
  for (const command of ["pool.profiles", "pool.start", "pool-host-entry", "pool-agent-config"]) {
    const result = await run("bridge.mjs", [command], { home });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Unsupported Factory command.*factory\.delegate/);
  }
  assert.deepEqual(await readdir(home), []);
});
