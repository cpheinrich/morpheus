import { mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * An explicit "someone is using this simulator" signal for the idle watchdog.
 *
 * The watchdog measures activity from writes inside user-installed apps, which is the right signal
 * for an app that is being exercised but a blind one for a person (or an agent) who is only
 * looking: scrolling a list writes nothing. Tools that drive a simulator themselves — today the QA
 * overlay, on every touch and key it forwards — call `recordSimulatorActivity`, and the watchdog
 * reads the file's mtime. Nothing else depends on the file, and a failure to write it must never
 * reach the person driving the device.
 */

export const ACTIVITY_THROTTLE_MS = 60_000;

const UDID = /^[0-9A-F]{8}(?:-[0-9A-F]{4}){3}-[0-9A-F]{12}$/i;

export function activityDir(): string {
  return process.env["MORPHEUS_SIMULATOR_ACTIVITY_DIR"] ?? join(homedir(), "Library", "Caches", "morpheus", "simulator-activity");
}

/** The heartbeat file for a device, or null for anything that is not a simulator UDID. */
export function activityPath(udid: string, dir = activityDir()): string | null {
  return UDID.test(udid) ? join(dir, udid.toUpperCase()) : null;
}

// A touch stream sends dozens of events a second; one write a minute is all the watchdog can use.
const lastWrite = new Map<string, number>();

/** Returns whether it wrote. Never throws. */
export function recordSimulatorActivity(udid: string, now = Date.now(), dir = activityDir()): boolean {
  const path = activityPath(udid, dir);
  if (!path) return false;
  const last = lastWrite.get(path);
  if (last !== undefined && now - last < ACTIVITY_THROTTLE_MS) return false;
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path, "", { flag: "a" });
    utimesSync(path, now / 1000, now / 1000);
    lastWrite.set(path, now);
    return true;
  } catch {
    return false;
  }
}

/** Test seam: forget the throttle so one test's heartbeat cannot suppress another's. */
export function resetActivityThrottle(): void {
  lastWrite.clear();
}
