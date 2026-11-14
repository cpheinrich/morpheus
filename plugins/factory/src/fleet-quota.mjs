import { z } from "zod";
import { readGatewayQuota, resolveKeyRef, secretRef } from "./config.mjs";

const schema = z.strictObject({
  name: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
  baseUrl: z.httpUrl().refine((value) => {
    const url = new URL(value);
    return !url.username && !url.password && !url.search && !url.hash;
  }),
  threshold: z.number().min(1).max(100),
  keyRef: secretRef,
});

const observationIntervalMs = 60_000;

export function createFleetQuota(config, { resolve = resolveKeyRef, read = readGatewayQuota, now = Date.now } = {}) {
  const { name, baseUrl, threshold, keyRef } = schema.parse(config);
  const selection = { provider: "codex", gateway: name };
  let observation;
  let inFlight;
  let lastStartedAt = -Infinity;

  async function measure() {
    try {
      const adminKey = await resolve(keyRef);
      if (!adminKey) throw new Error("Factory gateway has no quota credential");
      const [gateway] = await read([{ name, provider: "codex", baseUrl }], { adminKey });
      const used = gateway?.usedPercent;
      if (!Number.isFinite(used) || used < 0 || used > 100) return "unknown";
      return used < threshold ? "available" : "limited";
    } catch { return "unknown"; }
  }

  function refresh() {
    if (!inFlight) {
      lastStartedAt = now();
      inFlight = measure().then((status) => {
        observation = { ...selection, status, checkedAt: now() };
        return observation;
      }).finally(() => { inFlight = undefined; });
    }
    return inFlight;
  }

  async function checkQuota(request) {
    if (request.provider !== selection.provider || request.gateway !== selection.gateway)
      throw new Error("Factory gateway is not enrolled on Studio");
    // Admission always asks the gateway. A previous readiness heartbeat never admits a run.
    if ((await refresh()).status !== "available")
      throw new Error("Factory gateway is above its threshold or quota is unknown");
  }

  checkQuota.observation = () => {
    if (now() - lastStartedAt >= observationIntervalMs) void refresh();
    return observation;
  };
  return checkQuota;
}
