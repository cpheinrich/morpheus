#!/usr/bin/env node
// Paperclip process-adapter command for a pool agent. See src/pool-runner.mjs.
import { runTurn } from "../src/pool-runner.mjs";
try {
  process.exitCode = await runTurn();
} catch (error) {
  process.stdout.write(JSON.stringify({ pool: "runner", kind: "error", detail: String(error.message).split("\n")[0] }) + "\n");
  process.exitCode = 125;
}
// Intervals and sockets must not keep a finished turn alive.
process.stdout.write("", () => process.exit());
