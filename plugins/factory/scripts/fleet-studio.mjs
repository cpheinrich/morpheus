import { studioCapacity } from "../src/fleet-capacity.mjs";
import { connectFleet, readFleetConfig } from "../src/fleet-client.mjs";
import { createStudioExecutors } from "../src/fleet-execution.mjs";
import { createFleetQuota } from "../src/fleet-quota.mjs";
import { createFleetRunner } from "../src/fleet-runner.mjs";

try {
  const [path] = process.argv.slice(2);
  if (!path) throw new Error("Usage: node scripts/fleet-studio.mjs CONFIG");
  const config = await readFleetConfig(path);
  const client = await connectFleet(config);
  const checkQuota = createFleetQuota(config.quota);
  const execution = { ...config.execution, gatewayBaseUrl: config.quota.baseUrl };
  const runner = createFleetRunner({
    call: client.call,
    ...createStudioExecutors(execution, client.call, checkQuota),
    journalPath: config.journalPath,
    capacity: studioCapacity,
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
