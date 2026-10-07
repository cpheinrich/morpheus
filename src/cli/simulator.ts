import {
  disableWatchdog,
  enableWatchdog,
  readWatchdogConfig,
  refreshWatchdog,
  watchdogStatus,
  WATCHDOG_INTERVAL_SECONDS,
  type WatchdogChange,
} from "../simulator/agent.js";
import { DEFAULT_IDLE_HOURS, formatSweep, parseIdleHours, sweep } from "../simulator/watchdog.js";

export const SIMULATOR_USAGE = `morpheus simulator watchdog — shut down iOS simulators that nobody is using

  morpheus simulator watchdog run [--dry-run] [--idle-hours N] [--quiet]
      One sweep: shut down every booted simulator that has been booted for N hours (default ${DEFAULT_IDLE_HOURS})
      with no activity inside them. Only shutdown; nothing is deleted or erased. --dry-run says
      what would happen. Covers the default and the XCTest parallel-clone device sets.
  morpheus simulator watchdog enable [--idle-hours N]
      Install a launchd agent that runs the sweep every ${WATCHDOG_INTERVAL_SECONDS / 60} minutes, and remember the choice.
  morpheus simulator watchdog disable
      Remove the agent and remember the choice; \`self update\` will not bring it back.
  morpheus simulator watchdog status
      The preference, the agent, and what the next sweep would do right now.
  morpheus simulator watchdog refresh
      Repair the agent after an update, only if it was enabled. Run by \`self update\` and \`self ensure\`.

Activity is a write inside a user-installed app on the device, an install, or a touch or key
forwarded by the QA overlay. Apple's own apps do not count: they write constantly on an idle device.`;

/** Flags the global parser leaves in the positional list. */
function watchdogFlags(args: string[]): { idleHours?: number; quiet: boolean } {
  const out: { idleHours?: number; quiet: boolean } = { quiet: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--quiet") out.quiet = true;
    else if (arg === "--idle-hours") {
      const value = args[++i];
      if (value === undefined) throw new Error("--idle-hours needs a number of hours.");
      out.idleHours = parseIdleHours(value);
    } else throw new Error(`Unknown option: ${arg}`);
  }
  return out;
}

function printChange(change: WatchdogChange, verb: string): void {
  const hours = change.config.idleHours;
  console.log(`✓ Simulator watchdog ${verb}: idle threshold ${hours}h (${change.config.path}).`);
  if (change.agent !== "absent") console.log(`  Agent ${change.agent}: ${change.plist}\n  Log: ${change.log}`);
  for (const warning of change.warnings) console.log(`~ ${warning}`);
}

export async function watchdog(action: string | undefined, rest: string[], dryRun: boolean): Promise<number> {
  try {
    if (action === undefined || action === "help") {
      console.log(SIMULATOR_USAGE);
      return action === undefined ? 1 : 0;
    }
    const flags = watchdogFlags(rest);
    if (action === "run") {
      const config = await readWatchdogConfig();
      const idleHours = flags.idleHours ?? config.idleHours;
      const result = sweep({ idleHours, dryRun });
      const text = formatSweep(result, { dryRun, quiet: flags.quiet });
      if (text) console.log(text);
      return result.issues.length > 0 || result.decisions.some((d) => d.error) ? 1 : 0;
    }
    if (action === "enable") {
      printChange(await enableWatchdog({ idleHours: flags.idleHours }), "enabled");
      return 0;
    }
    if (action === "disable") {
      const change = await disableWatchdog();
      console.log(`✓ Simulator watchdog disabled (${change.config.path}); agent ${change.agent}. \`self update\` will not re-enable it.`);
      return 0;
    }
    if (action === "refresh") {
      const change = await refreshWatchdog();
      // Silent unless it changed something: this runs from `self ensure` after every pull.
      if (change.agent !== "current" && change.agent !== "absent") printChange(change, "refreshed");
      for (const warning of change.warnings) console.error(`~ ${warning}`);
      return 0;
    }
    if (action === "status") {
      const status = await watchdogStatus();
      const { config } = status;
      console.log(`Simulator watchdog: ${config.preference}${config.preference === "enabled" ? ` (idle threshold ${config.idleHours}h)` : ""} — ${config.path}`);
      if (config.detail) console.log(`  ${config.detail}`);
      console.log(`Agent: ${status.plist === "missing" ? "not installed" : `${status.loaded ? "loaded" : "not loaded"}, ${status.plist}`} — ${status.paths.plist}`);
      if (status.plist === "stale" && config.preference === "enabled") console.log("  Run `morpheus simulator watchdog refresh` to rewrite it for this Morpheus.");
      if (config.preference === "unconfigured") console.log("  Run `morpheus simulator watchdog enable` to turn it on.");
      console.log(`Log: ${status.paths.log}\n\nIf it ran now:`);
      const result = sweep({ idleHours: config.idleHours, dryRun: true });
      console.log(formatSweep(result, { dryRun: true }));
      return 0;
    }
    console.error(`Unknown watchdog command "${action}".\n\n${SIMULATOR_USAGE}`);
    return 1;
  } catch (error) {
    console.error(`Simulator watchdog: ${(error as Error).message}`);
    return 1;
  }
}
