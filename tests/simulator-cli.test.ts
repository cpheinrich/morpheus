import { afterEach, describe, expect, it, vi } from "vitest";
import { SIMULATOR_USAGE, watchdog } from "../src/cli/simulator.js";

afterEach(() => vi.restoreAllMocks());

// Every case here fails before the command touches this Mac's simulators, launchd or home directory.
describe("morpheus simulator watchdog argument handling", () => {
  it("prints usage and fails when no action is given, and succeeds for help", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await watchdog(undefined, [], false)).toBe(1);
    expect(await watchdog("help", [], false)).toBe(0);
    expect(log).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith(SIMULATOR_USAGE);
  });

  it("documents the guarantee that matters most: nothing is deleted or erased", () => {
    expect(SIMULATOR_USAGE).toMatch(/Only shutdown; nothing is deleted or erased/);
    expect(SIMULATOR_USAGE).toMatch(/Apple's own apps do not count/);
  });

  it.each([
    [["--idle-hours"], /--idle-hours needs a number/],
    [["--idle-hours", "0"], /--idle-hours must be a number from 1 to 720/],
    [["--idle-hours", "soon"], /--idle-hours must be a number/],
    [["--bogus"], /Unknown option: --bogus/],
  ])("refuses `run %j` before doing anything", async (args, message) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await watchdog("run", args, false)).toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringMatching(message));
  });

  it("refuses an unknown action with the usage text", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await watchdog("nuke", [], false)).toBe(1);
    expect(error).toHaveBeenCalledWith(`Unknown watchdog command "nuke".\n\n${SIMULATOR_USAGE}`);
  });
});
