import { z } from "zod";
import { available, freshHeartbeat } from "./fleet-claims.mjs";

const quotaMaxAgeMs = 120_000;
export const quotaObservation = z.object({
  provider: z.literal("codex"),
  gateway: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
  checkedAt: z.number().int().nonnegative(),
  status: z.enum(["available", "limited", "unknown"]),
});

function quotaStatus(slot, selection, now) {
  const quota = quotaObservation.safeParse(slot?.quota).data;
  if (!quota) return { status: "unknown" };
  const { checkedAt } = quota;
  if (!freshHeartbeat({ observedAt: checkedAt }, now, quotaMaxAgeMs)) return { status: "unknown", checkedAt };
  if (quota.provider !== selection.provider || quota.gateway !== selection.gateway)
    return { status: "incompatible", checkedAt };
  return { status: quota.status, checkedAt };
}

function projectSlot(slotId, hostId, slot, selection, now, maxAgeMs) {
  const fresh = freshHeartbeat(slot, now, maxAgeMs);
  const quota = quotaStatus(slot, selection, now);
  const heartbeat = { observedAt: slot?.observedAt ?? null, fresh, capacityMiB: fresh ? slot.capacity : null };
  const idle = available(slot, now, maxAgeMs);
  return { slotId, hostId: hostId ?? null, heartbeat, busy: Boolean(slot?.attemptId), quota, placementCandidate: idle && quota.status === "available" };
}

export async function fleetReadiness(db, users, name, project, now, maxAgeMs) {
  const workers = new Map(Object.values(users).filter((user) => user.role === "worker")
    .map((user) => [user.slotId, user.hostId]));
  const slots = await Promise.all(project.eligibleSlots.map(async (slotId) => {
    const hostId = workers.get(slotId);
    const slot = hostId ? (await db.doc(`factorySlots/${slotId}`).get()).data() : undefined;
    return projectSlot(slotId, hostId, slot?.hostId === hostId ? slot : undefined, project.selection, now, maxAgeMs);
  }));
  return { project: name, selection: project.selection, observedAt: now, slots };
}
