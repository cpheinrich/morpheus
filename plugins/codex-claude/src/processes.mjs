import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
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
export async function stopOrphan(record) {
  // Never signal a PID merely because a stale JSON file names it.
  if (
    !record.claudeIdentity ||
    (await identity(record.claudePid)) !== record.claudeIdentity
  )
    return false;
  try {
    process.kill(-record.claudePid, "SIGTERM");
  } catch (e) {
    if (e.code !== "ESRCH") throw e;
  }
  await new Promise((r) => setTimeout(r, 1000));
  if ((await identity(record.claudePid)) === record.claudeIdentity)
    try {
      process.kill(-record.claudePid, "SIGKILL");
    } catch (e) {
      if (e.code !== "ESRCH") throw e;
    }
  return true;
}
