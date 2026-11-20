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
  const checkCodexQuota = createFleetQuota(config.quota);
  const checkClaudeQuota = config.claudeQuota ? createFleetQuota({ ...config.claudeQuota, provider: "claude" }) : null;
  const checkQuota = task => (task.provider === "claude" && checkClaudeQuota ? checkClaudeQuota : checkCodexQuota)(task);
  const quotaObservation = () => {
    const codex = checkCodexQuota.observation();
    if (!checkClaudeQuota) return codex;
    return [codex, checkClaudeQuota.observation()].filter(Boolean);
  };
  const execution = { ...config.execution, gatewayBaseUrl: config.quota.baseUrl, claudeGatewayBaseUrl: config.claudeQuota?.baseUrl };
  const runner = createFleetRunner({
    call: client.call,
    ...createStudioExecutors(execution, client.call, checkQuota),
    journalPath: config.journalPath,
    capacity: studioCapacity,
    quotaObservation,
  });
  const tick = () => runner.tick().then(result => {
    if (result === "reconciling") console.error("Factory control request interrupted; retaining the last confirmed lease");
  }).catch(() => console.error("Factory Studio tick failed; reconciling on next wake"));
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
