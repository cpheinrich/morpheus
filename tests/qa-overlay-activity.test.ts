import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startQaCommentServer } from "../src/qa/serve.js";
import { resetActivityThrottle } from "../src/simulator/activity.js";

const UDID = "714BCBAF-02CF-4182-AC18-4522F0A4ABBF";

let scratch: string;
let beats: string;
let previous: string | undefined;
let close: (() => Promise<void>) | undefined;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "morpheus-overlay-"));
  beats = join(scratch, "beats");
  previous = process.env["MORPHEUS_SIMULATOR_ACTIVITY_DIR"];
  process.env["MORPHEUS_SIMULATOR_ACTIVITY_DIR"] = beats;
  resetActivityThrottle();
});
afterEach(async () => {
  await close?.();
  close = undefined;
  if (previous === undefined) delete process.env["MORPHEUS_SIMULATOR_ACTIVITY_DIR"];
  else process.env["MORPHEUS_SIMULATOR_ACTIVITY_DIR"] = previous;
  rmSync(scratch, { recursive: true, force: true });
});

/** The overlay against a serve-sim that is not there: the routes only need the bridge object. */
async function overlay() {
  const server = await startQaCommentServer({
    root: scratch, previewUrl: "http://127.0.0.1:9/", streamUrl: `http://127.0.0.1:9/helper/${UDID}/stream.mjpeg`, port: 0, project: "evo",
  });
  close = server.close;
  return (path: string, body: unknown) =>
    fetch(`${server.url}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

describe("the QA overlay tells the idle watchdog someone is driving the simulator", () => {
  it("writes the device's heartbeat when it forwards a touch", async () => {
    const post = await overlay();
    expect(existsSync(join(beats, UDID))).toBe(false);
    expect((await post("api/touch", { type: "begin", normX: 0.5, normY: 0.5 })).status).toBe(204);
    expect(existsSync(join(beats, UDID))).toBe(true);
    expect(Date.now() - statSync(join(beats, UDID)).mtimeMs).toBeLessThan(10_000);
  });

  it("writes it for a key press too", async () => {
    const post = await overlay();
    expect((await post("api/key", { type: "down", code: "KeyA" })).status).toBe(204);
    expect(existsSync(join(beats, UDID))).toBe(true);
  });

  it("does not count a request it rejected", async () => {
    const post = await overlay();
    expect((await post("api/touch", { type: "wiggle", normX: 0.5, normY: 0.5 })).status).toBe(400);
    expect((await post("api/touch", { type: "begin", normX: "x", normY: 0.5 })).status).toBe(400);
    expect((await post("api/key", { type: "down", code: "NotAKey" })).status).toBe(400);
    expect(existsSync(join(beats, UDID))).toBe(false);
  });
});
