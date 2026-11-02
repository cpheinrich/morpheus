#!/usr/bin/env node
// Host side of a pool turn: `run --config PATH` (envelope on stdin) or
// `reconcile RUN_UUID --config PATH`. See src/pool-host.mjs.
import { runHost, reconcileHost } from "../src/pool-host.mjs";
// A dropped SSH session closes stdout; the turn must still stop and record its receipt.
process.stdout.on("error", () => {});
const args = process.argv.slice(2);
const at = args.indexOf("--config");
const configPath = at >= 0 ? args[at + 1] : undefined;
const positional = args.filter((_, i) => i !== at && i !== at + 1);
try {
  if (!configPath) throw new Error("usage: pool-remote.mjs (run | reconcile RUN_UUID) --config PATH");
  if (positional[0] === "run") process.exitCode = await runHost({ configPath });
  else if (positional[0] === "reconcile") {
    const result = await reconcileHost({ configPath, runUuid: positional[1] });
    process.stdout.write(JSON.stringify(result) + "\n");
    process.exitCode = result.state === "terminated" ? 0 : 1;
  } else throw new Error("usage: pool-remote.mjs (run | reconcile RUN_UUID) --config PATH");
} catch (error) {
  process.stdout.write(JSON.stringify({ pool: "refused", category: "host", detail: String(error.message).split("\n")[0] }) + "\n");
  process.exitCode = 78;
}
process.stdout.write("", () => process.exit());
