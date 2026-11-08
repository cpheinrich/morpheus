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

export function createFleetQuota(config, { resolve = resolveKeyRef, read = readGatewayQuota } = {}) {
  const { name, baseUrl, threshold, keyRef } = schema.parse(config);
  return async function checkQuota(selection) {
    if (selection.provider !== "codex" || selection.gateway !== name)
      throw new Error("Factory gateway is not enrolled on Studio");
    const adminKey = await resolve(keyRef);
    if (!adminKey) throw new Error("Factory gateway has no quota credential");
    const [gateway] = await read([{ name, provider: "codex", baseUrl }], { adminKey });
    if (!Number.isFinite(gateway?.usedPercent) || gateway.usedPercent < 0 || gateway.usedPercent >= threshold)
      throw new Error("Factory gateway is above its threshold or quota is unknown");
  };
}
