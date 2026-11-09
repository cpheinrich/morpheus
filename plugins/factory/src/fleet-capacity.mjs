import { execFileSync } from "node:child_process";
import { freemem, platform } from "node:os";

const mib = 1024 * 1024;
const reserve = 4096;

export function macCapacity(stat) {
  const pageSize = Number(stat.match(/page size of (\d+) bytes/)?.[1]);
  const free = Number(stat.match(/^Pages free:\s+(\d+)\.$/m)?.[1]);
  const inactive = Number(stat.match(/^Pages inactive:\s+(\d+)\.$/m)?.[1]);
  if (!Number.isSafeInteger(pageSize) || pageSize <= 0 ||
      !Number.isSafeInteger(free) || !Number.isSafeInteger(inactive)) return null;
  // Inactive pages can be reclaimed. Exclude active, wired and compressed pages.
  return Math.max(0, Math.floor((free + inactive) * pageSize / mib) - reserve);
}

export function studioCapacity() {
  if (platform() === "darwin") {
    try {
      const stat = execFileSync("/usr/bin/vm_stat", { encoding: "utf8", timeout: 2000, env: { LC_ALL: "C" } });
      const capacity = macCapacity(stat);
      if (capacity !== null) return capacity;
    } catch {
      // Fall back to immediately free memory if the host sample is unavailable.
    }
  }
  return Math.max(0, Math.floor(freemem() / mib) - reserve);
}
