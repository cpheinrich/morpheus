import { hash, type CdState } from "./schema.js";
import { invariant } from "./state.js";

/** Runs before every commit, including transitions introduced by later controller versions. */
export function assertTransition(previous: CdState, next: CdState): void {
  invariant(next.epoch === previous.epoch && next.repository === previous.repository && next.schemaVersion === previous.schemaVersion, "Epoch/schema changes require an explicit lossless migration");
  for (const [id, record] of Object.entries(previous.transitions)) invariant(hash(next.transitions[id]) === hash(record), "Applied transition history cannot be removed or rewritten");
  for (const [id, old] of Object.entries(previous.intents)) {
    const current = next.intents[id]; invariant(current, "Delivery obligations and receipts cannot be deleted");
    for (const key of ["id", "channel", "slot", "originalSource", "selectedMainEnteredAt", "validation", "isolatedValidation", "groupId", "createdAt"] as const) invariant(current[key] === old[key], `Original delivery ${key} is immutable`);
    invariant(Date.parse(current.oldestDebtAt) <= Date.parse(old.oldestDebtAt) && Date.parse(current.deadlineAt) <= Date.parse(old.deadlineAt), "New work cannot reset the oldest debt or overdue clock");
    invariant(current.attempts.length >= old.attempts.length && current.lineage.length >= old.lineage.length, "Attempts and source lineage are append-only");
    invariant(hash(current.lineage.slice(0, old.lineage.length)) === hash(old.lineage), "Existing source lineage cannot be rewritten");
    if (old.receipt) invariant(current.state === "delivered" && hash(current.receipt) === hash(old.receipt), "The committed final receipt is immutable");
    for (let index = 0; index < old.attempts.length; index++) {
      const before = old.attempts[index]!, after = current.attempts[index]!;
      for (const key of ["id", "dispatchEffectId", "sourceSha", "controlSha", "appInputDigest", "configurationDigest", "appId", "version", "buildNumber", "lane", "createdAt"] as const) invariant(before[key] === after[key], `Attempt ${key} is immutable`);
      if (before.runId) invariant(before.runId === after.runId && before.runAttempt === after.runAttempt, "Bound workflow/run attempt cannot change");
      if (before.tests) invariant(hash(before.tests) === hash(after.tests), "Committed full-test evidence is immutable");
      if (before.upload) invariant(after.upload && before.upload.id === after.upload.id && hash(before.upload.identity) === hash(after.upload.identity) && (!before.upload.acceptedAt || before.upload.acceptedAt === after.upload.acceptedAt), "Upload claims/identity/acceptance cannot be erased or reused");
    }
  }
  for (const [channel, old] of Object.entries(previous.cursors)) invariant(next.cursors[channel as "staging" | "production"]!.order >= old!.order, "Ordinary delivery cursors cannot regress");
  for (const [group, old] of Object.entries(previous.groupCursors ?? {})) invariant(next.groupCursors?.[group] && next.groupCursors[group]!.order >= old.order, "Internal group cursors cannot regress");
  for (const [key, before] of Object.entries(previous.builds)) {
    const after = next.builds[key]; invariant(after && BigInt(after.maximum) >= BigInt(before.maximum), "Build sequence cannot regress");
    for (const [id, reservation] of Object.entries(before.reservations)) invariant(hash(after.reservations[id]) === hash(reservation), "Build reservations remain burned forever");
  }
  invariant(next.budget.spentMicros >= previous.budget.spentMicros, "Settled spend cannot decrease");
  for (const [id, before] of Object.entries(previous.budget.reservations)) {
    const after = next.budget.reservations[id]; invariant(after && after.digest === before.digest && after.maximumMicros === before.maximumMicros, "Paid request liability/identity cannot be discarded");
    if (before.status === "settled") invariant(hash(after) === hash(before), "Paid settlement tombstones are immutable");
  }
  for (const intent of Object.values(next.intents)) {
    invariant(Number.isFinite(Date.parse(intent.nextCheckAt)) && Number.isFinite(Date.parse(intent.deadlineAt)), "Every delivery needs an explicit next check and original deadline");
    if (intent.state === "repairing") invariant(Object.values(next.agents).some(work => work.intentId === intent.id && work.state !== "complete"), "Repairing state must atomically own durable agent work");
    if (intent.state === "delivered") invariant(intent.receipt, "Delivery requires its exact immutable receipt");
  }
  for (const channel of ["staging", "production"] as const) invariant(Object.values(next.intents).filter(intent => intent.channel === channel && !intent.validation && intent.state !== "delivered").length <= 1, "Only one ordinary delivery per channel may be outstanding");
}
