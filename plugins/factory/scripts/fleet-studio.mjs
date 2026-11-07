import { freemem } from "node:os";
import { connectFleet, readFleetConfig } from "../src/fleet-client.mjs";
import { createStudioExecutor } from "../src/fleet-execution.mjs";
import { createFleetRunner } from "../src/fleet-runner.mjs";

try {
  const [path] = process.argv.slice(2);
  if (!path) throw new Error("Usage: node scripts/fleet-studio.mjs CONFIG");
  const config = await readFleetConfig(path);
  const client = await connectFleet(config);
  const runner = createFleetRunner({
    call: client.call,
    execute: createStudioExecutor(config.execution, client.call),
    journalPath: config.journalPath,
    // Rank only fresh, eligible hosts. Keep a small memory reserve on each Mac.
    capacity: () => Math.max(0, Math.floor(freemem() / (1024 * 1024)) - 4096),
  });
  const tick = () => runner.tick().catch(() => console.error("Factory Studio tick failed; reconciling on next wake"));
  const unsubscribe = client.listen(tick, () => console.error("Factory Studio listener disconnected; using timed reconciliation"));
  const interval = setInterval(tick, 5000);
  const stop = () => {
    runner.stop();
    unsubscribe();
    // Leave the interval alive briefly so a stopped guardian can return its proof.
    setTimeout(async () => {
      clearInterval(interval);
      await client.close();
    }, 20_000).unref();
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  await tick();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
