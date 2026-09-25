import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export async function identity(pid) {
  if (!Number.isInteger(pid) || pid <= 1) return null;
  try {
    return (
      (
        await exec(
          "ps",
          ["-p", String(pid), "-o", "lstart=", "-o", "pgid=", "-o", "uid="],
          { timeout: 2000, maxBuffer: 2048 },
        )
      ).stdout.trim() || null
    );
  } catch {
    return null;
  }
}
async function members(group) {
  const { stdout } = await exec("ps", ["-axo", "pid=,pgid=,stat="], {
    timeout: 2000,
    maxBuffer: 1024 * 1024,
  });
  return stdout
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .filter(
      ([pid, pgid, state]) => Number(pgid) === group && !state?.startsWith("Z"),
    )
    .map(([pid]) => Number(pid));
}
export async function stopOrphan(record) {
  if (!Number.isInteger(record.claudePid) || record.claudePid <= 1)
    return false;
  if (!record.claudeIdentity) return false;
  const current = await identity(record.claudePid);
  if (current && current !== record.claudeIdentity) return false;
  const initial = await members(record.claudePid);
  if (!initial.length) return true;
  if (
    !record.claudeIdentity ||
    (await identity(record.claudePid)) !== record.claudeIdentity
  )
    return false;
  // Keep identity anchors for all existing group members, not only its leader:
  // a leader can exit on TERM while a descendant ignores it.
  const anchors = new Map(
    await Promise.all(initial.map(async (pid) => [pid, await identity(pid)])),
  );
  const owned = async () => {
    for (const pid of await members(record.claudePid)) {
      const known = anchors.get(pid);
      if (known && (await identity(pid)) === known) return true;
    }
    return false;
  };
  const signal = async (name) => {
    if (!(await owned())) return;
    try {
      process.kill(-record.claudePid, name);
    } catch (e) {
      if (e.code !== "ESRCH") throw e;
    }
  };
  await signal("SIGTERM");
  await sleep(1000);
  await signal("SIGKILL");
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!(await members(record.claudePid)).length) return true;
    await sleep(50);
  }
  // Unproven cleanup must retain the working-directory lock.
  return false;
}
