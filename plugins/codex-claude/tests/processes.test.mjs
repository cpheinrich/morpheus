import { test } from "node:test";
import assert from "node:assert/strict";
import { identity, stopOrphan } from "../src/processes.mjs";
test("stale or missing process identity cannot signal an unrelated process", async () => {
  const own = await identity(process.pid);
  assert.equal(typeof own, "string");
  assert.equal(
    await stopOrphan({
      claudePid: process.pid,
      claudeIdentity: "a stale different process",
    }),
    false,
  );
  assert.equal(await stopOrphan({ claudePid: process.pid }), false);
  assert.equal(await identity(-1), null);
  assert.equal(await identity(1), null);
});

test("orphan cleanup removes TERM-ignoring descendants after leader exits", async (t) => {
  const { spawn } = await import("node:child_process");
  const { once } = await import("node:events");
  const code =
    "import subprocess,time,sys\np=subprocess.Popen(['python3','-c','import signal,time;signal.signal(signal.SIGTERM,signal.SIG_IGN);time.sleep(60)'])\ntime.sleep(.1)\nprint(p.pid,flush=True)\ntime.sleep(60)";
  const leader = spawn("python3", ["-c", code], {
    detached: true,
    stdio: ["ignore", "pipe", "ignore"],
  });
  t.after(() => {
    try {
      process.kill(-leader.pid, "SIGKILL");
    } catch {}
  });
  const [data] = await once(leader.stdout, "data");
  const descendant = Number(data.toString().trim());
  const stamp = await identity(leader.pid);
  assert.equal(
    await stopOrphan({ claudePid: leader.pid, claudeIdentity: stamp }),
    true,
  );
  assert.equal(await identity(leader.pid), null);
  try {
    process.kill(descendant, 0);
    const { readFile } = await import("node:fs/promises");
    assert.match(await readFile(`/proc/${descendant}/stat`, "utf8"), /\) Z /);
  } catch (e) {
    if (!["ESRCH", "ENOENT"].includes(e.code)) throw e;
  }
});
