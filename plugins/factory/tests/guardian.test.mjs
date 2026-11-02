import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
const guardian = fileURLToPath(new URL("../src/guardian.py", import.meta.url));
async function setup(t, script, options = {}) {
  const root = await mkdtemp(join(tmpdir(), "bridge-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "child.py"), script);
  await writeFile(
    join(root, "job.json"),
    JSON.stringify({
      runId: "test",
      argv: ["python3", join(root, "child.py")],
      cwd: root,
      prompt: "test",
      graceSeconds: 0.3,
      maxRunSeconds: 10,
      ...options,
    }),
  );
  const child = spawn("python3", [guardian, join(root, "job.json")], {
    stdio: ["pipe", "ignore", "pipe"],
  });
  let err = "";
  child.stderr.on("data", (b) => (err += b));
  t.after(() => {
    if (child.exitCode === null) child.kill("SIGTERM");
  });
  return {
    root,
    child,
    done: async () => {
      await once(child, "exit");
      assert.equal(err, "");
      return JSON.parse(await readFile(join(root, "process.json"), "utf8"));
    },
  };
}
test("owner disconnect kills owned Claude group, including descendants", async (t) => {
  const { root, child, done } = await setup(
    t,
    "import subprocess,time,pathlib\np=subprocess.Popen(['python3','-c','import time;time.sleep(60)'])\npathlib.Path('descendant').write_text(str(p.pid))\ntime.sleep(60)\n",
  );
  child.stdin.end();
  const state = await done();
  assert.equal(state.state, "exited");
  assert.equal(state.interrupted, true);
  assert.equal(state.reason, "Owner lease expired");
  assert.throws(() => process.kill(state.claudePid, 0), { code: "ESRCH" });
  const descendant = Number(await readFile(join(root, "descendant"), "utf8"));
  // On Linux an orphan can briefly be a zombie until init reaps it; it must not execute.
  try {
    process.kill(descendant, 0);
    const proc = await readFile(`/proc/${descendant}/stat`, "utf8");
    assert.match(proc, /\) Z /);
  } catch (e) {
    if (e.code !== "ESRCH" && e.code !== "ENOENT") throw e;
  }
});
test("normal completion persists output and leaves no running child", async (t) => {
  const { root, done } = await setup(
    t,
    "import sys,json\nsys.stdin.readline()\nprint(json.dumps({'type':'result','result':'✓ done'}),flush=True)\n",
  );
  const state = await done();
  assert.equal(state.exitCode, 0);
  assert.equal(state.interrupted, false);
  assert.match(await readFile(join(root, "events.jsonl"), "utf8"), /result/);
  assert.throws(() => process.kill(state.claudePid, 0), { code: "ESRCH" });
});
test("explicit background survives lost owner but obeys hard timeout", async (t) => {
  const { child, done } = await setup(t, "import time\ntime.sleep(60)\n", {
    background: true,
    maxRunSeconds: 0.7,
  });
  child.stdin.end();
  const started = Date.now();
  const state = await done();
  assert.ok(Date.now() - started >= 700);
  assert.equal(state.interrupted, true);
  assert.notEqual(state.reason, "Owner lease expired");
});
test("unread input cannot block owner-expiry cleanup", async (t) => {
  const { child, done } = await setup(t, "import time\ntime.sleep(60)\n", {
    prompt: "x".repeat(300000),
  });
  child.stdin.end();
  const state = await done();
  assert.equal(state.reason, "Owner lease expired");
  assert.equal(state.interrupted, true);
});
test("output cap stops a noisy worker and bounds persisted bytes", async (t) => {
  const { root, done } = await setup(
    t,
    "import sys,time\nsys.stdin.readline()\nwhile True:\n print('x'*1000,flush=True)\n time.sleep(.01)\n",
    { maxLogBytes: 256 },
  );
  const state = await done();
  assert.equal(state.reason, "Output limit reached");
  assert.equal(state.interrupted, true);
  assert.ok((await readFile(join(root, "events.jsonl"))).length <= 256);
});
